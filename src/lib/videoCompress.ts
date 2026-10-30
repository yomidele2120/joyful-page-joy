// Shrinks a video in the browser before it is uploaded, so a 200MB phone recording becomes a few MB.
// No libraries: the video is played into a canvas at a smaller size and re-recorded with MediaRecorder
// (the same hardware encoder the phone uses). It runs at normal playback speed, so a 40s video takes
// about 40s, and the screen must stay open meanwhile. If anything goes wrong, or the browser cannot do
// it, the original file is returned untouched so posting never gets blocked by this step.

const MAX_LONG_EDGE = 1280;            // 720p
const VIDEO_BITS_PER_SECOND = 2_500_000;
const AUDIO_BITS_PER_SECOND = 96_000;
const SKIP_IF_SMALLER_THAN = 8 * 1024 * 1024; // already light enough: leave it alone

// mp4 first (plays everywhere, including iPhones); webm only where mp4 recording is not supported.
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return MIME_CANDIDATES.find(t => MediaRecorder.isTypeSupported(t)) ?? null;
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/**
 * Returns a smaller copy of the video (same orientation, up to 720p), or the original file when it is
 * already small, when shrinking is not possible here, or when the result would not be smaller.
 * `onProgress` receives 0..1.
 */
export async function compressVideo(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  const mime = pickMimeType();
  if (!mime || typeof document === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return file;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  let audioCtx: AudioContext | null = null;
  let hiddenDuringEncode = false;
  const onVisibility = () => { if (document.hidden) hiddenDuringEncode = true; };

  try {
    video.muted = false;           // audio is routed through WebAudio below, so nothing plays out loud
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('unreadable video'));
    });

    const { videoWidth: srcW, videoHeight: srcH, duration } = video;
    if (!srcW || !srcH || !isFinite(duration) || duration <= 0) return file;

    const scale = Math.min(1, MAX_LONG_EDGE / Math.max(srcW, srcH));
    if (scale === 1 && file.size <= SKIP_IF_SMALLER_THAN) return file;
    const width = even(srcW * scale);
    const height = even(srcH * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    const stream = canvas.captureStream(30);

    // Keep the sound: play the video's audio into the recording instead of the speakers.
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return file;
    audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const source = audioCtx.createMediaElementSource(video);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    destination.stream.getAudioTracks().forEach(t => stream.addTrack(t));

    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };

    const finished = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error('recording failed'));
    });

    document.addEventListener('visibilitychange', onVisibility);
    ctx.drawImage(video, 0, 0, width, height);
    recorder.start(1000);

    // Copy each video frame onto the canvas as it is shown.
    let stopped = false;
    const withFrameCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    const paint = () => {
      if (stopped) return;
      ctx.drawImage(video, 0, 0, width, height);
      onProgress?.(Math.min(1, video.currentTime / duration));
      if (withFrameCallback.requestVideoFrameCallback) withFrameCallback.requestVideoFrameCallback(paint);
      else requestAnimationFrame(paint);
    };
    paint();

    const ended = new Promise<void>(resolve => { video.onended = () => resolve(); });
    await video.play();
    // Safety net so a stuck video can never hang the upload.
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), (duration * 2 + 20) * 1000));
    const outcome = await Promise.race([ended.then(() => 'ended' as const), timeout]);

    stopped = true;
    if (recorder.state !== 'inactive') recorder.stop();
    await finished;
    video.pause();

    // A video recorded while the screen was off or the app in the background has frozen frames.
    if (outcome === 'timeout' || hiddenDuringEncode || !chunks.length) return file;

    const outType = mime.split(';')[0];
    const blob = new Blob(chunks, { type: outType });
    if (blob.size >= file.size) return file;

    onProgress?.(1);
    const ext = outType === 'video/mp4' ? 'mp4' : 'webm';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}.${ext}`, { type: outType, lastModified: Date.now() });
  } catch (err) {
    console.warn('Video shrinking skipped, uploading the original:', err);
    return file;
  } finally {
    document.removeEventListener('visibilitychange', onVisibility);
    try { video.pause(); } catch { /* ignore */ }
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
    audioCtx?.close().catch(() => undefined);
  }
}
