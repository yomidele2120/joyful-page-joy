// Client-side media helpers used by the vendor post composer.
// Images are downscaled/re-encoded before upload so the feed stays fast on
// mobile data, while still looking sharp on large screens.

export const MAX_IMAGE_MB = 15;
export const MAX_VIDEO_MB = 60;
export const MAX_IMAGES_PER_POST = 10;

const MAX_DIMENSION = 1440;
const JPEG_QUALITY = 0.85;

export interface MediaValidationError {
  file: string;
  reason: string;
}

export function validateMediaFile(file: File): string | null {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) return 'Unsupported file type';
  if (isImage && file.size > MAX_IMAGE_MB * 1024 * 1024) return `Images must be under ${MAX_IMAGE_MB}MB`;
  if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) return `Videos must be under ${MAX_VIDEO_MB}MB`;
  return null;
}

// Stable identity so the same photo can't be picked twice.
export function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export async function compressImage(file: File): Promise<Blob> {
  // GIFs / SVGs would lose animation or fidelity — leave them untouched.
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    // Never upload something bigger than the original.
    if (!blob || blob.size >= file.size) return file;
    return blob;
  } catch {
    return file;
  }
}

// Grabs a poster frame (and duration) from a local video file for the picker grid.
export function videoMetaFromFile(file: File): Promise<{ poster: string | null; duration?: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    let duration: number | undefined;
    const fail = () => {
      URL.revokeObjectURL(url);
      resolve({ poster: null, duration });
    };

    video.onloadedmetadata = () => {
      duration = isFinite(video.duration) ? video.duration : undefined;
      video.currentTime = Math.min(0.3, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(url);
        resolve({ poster: dataUrl, duration });
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });
}

// Backwards-compatible helper used elsewhere in the app.
export function videoPosterFromFile(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const fail = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.3, (video.duration || 1) / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return fail();
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch {
        fail();
      }
    };
    video.onerror = fail;
  });
}
