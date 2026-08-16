// Captures a still frame from a video File as a JPEG Blob, entirely in the
// browser — no server-side transcoding needed. This gives every post an
// instant poster image so the feed never shows a blank black rectangle
// while a video's first frame loads.
export function captureVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(file);
    video.src = url;

    const cleanup = () => URL.revokeObjectURL(url);

    video.onloadedmetadata = () => {
      // Seek slightly past the very first frame — the true frame 0 of many
      // phone-recorded videos is black or a lens-cap flash.
      video.currentTime = Math.min(0.3, video.duration / 2 || 0);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            cleanup();
            resolve(blob);
          },
          'image/jpeg',
          0.8
        );
      } catch {
        cleanup();
        resolve(null);
      }
    };

    video.onerror = () => {
      cleanup();
      resolve(null);
    };
  });
}
