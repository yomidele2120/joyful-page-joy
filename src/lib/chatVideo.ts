// Phones record video in HEVC/H.265 (.mov or .mp4), and desktops record VP9/AV1 (.webm). Many phones cannot decode
// those, so the receiver hears sound but sees no picture. Before a chat video is uploaded we convert it to H.264/AAC
// MP4, which plays on every phone and browser. The converter (ffmpeg.wasm) is downloaded only when it is needed.

const MAX_CONVERT_BYTES = 150 * 1024 * 1024;   // larger files are sent as they are (converting in the browser would take too long)
const CORE_VERSION = '0.12.6';
const CORE_BASE = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`;

const RISKY_CODEC_MARKERS = ['hvc1', 'hev1', 'dvh1', 'dvhe', 'av01', 'vp09', 'vp08'];

/** True when the file's video track may not play on every phone. */
export async function needsVideoConversion(file: File): Promise<boolean> {
  if (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|webm|mkv|avi|3gp)$/i.test(file.name)) return false;
  const name = file.name.toLowerCase();
  if (file.type === 'video/quicktime' || file.type === 'video/webm' || /\.(mov|webm|mkv|avi|3gp)$/.test(name)) return true;
  // MP4: the codec name sits in the file's header box, which is at the start or the end of the file.
  const span = 3 * 1024 * 1024;
  const parts = [file.slice(0, Math.min(span, file.size))];
  if (file.size > span) parts.push(file.slice(Math.max(span, file.size - span)));
  for (const part of parts) {
    const bytes = new Uint8Array(await part.arrayBuffer());
    const text = new TextDecoder('latin1').decode(bytes);
    if (RISKY_CODEC_MARKERS.some(m => text.includes(m))) return true;
  }
  return false;
}

/** Convert to H.264/AAC MP4. Returns the original file if conversion is not possible. */
export async function toPlayableVideo(file: File, onProgress?: (ratio: number) => void): Promise<File> {
  try {
    if (!(await needsVideoConversion(file))) return file;
    if (file.size > MAX_CONVERT_BYTES) return file;
    const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([import('@ffmpeg/ffmpeg'), import('@ffmpeg/util')]);
    const ff = new FFmpeg();
    if (onProgress) ff.on('progress', ({ progress }: { progress: number }) => onProgress(Math.max(0, Math.min(1, progress))));
    await ff.load({
      coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    await ff.writeFile('in', await fetchFile(file));
    const code = await ff.exec([
      '-i', 'in',
      '-vf', "scale=-2:'min(720,ih)'",
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      'out.mp4',
    ]);
    if (code !== 0) { ff.terminate(); return file; }
    const data = await ff.readFile('out.mp4');
    ff.terminate();
    if (!(data instanceof Uint8Array) || data.byteLength < 1024) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([data], `${base}.mp4`, { type: 'video/mp4' });
  } catch (e) {
    console.warn('Video conversion failed, sending the original', e);
    return file;
  }
}
