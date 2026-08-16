// Native media-library access for the in-app gallery picker.
//
// The web platform cannot enumerate a phone's camera roll, so on device we go
// through Capacitor:
//   • iOS  — @capacitor-community/media can list the camera roll directly, so
//            we render real thumbnails inside our own grid.
//   • Android — the OS only exposes its media library through the system
//            *photo picker* (a gallery grid of photos/videos, NOT the Files /
//            DocumentsUI browser). We launch that, then curate the result in
//            our own screen.
//   • Web  — falls back to a file input, handled by the picker component.
//
// Everything is loaded lazily so the browser bundle never pulls native code in.

export interface DeviceMedia {
  id: string;
  kind: 'image' | 'video';
  /** data: or capacitor:// URL suitable for an <img src> thumbnail */
  preview: string;
  /** seconds, videos only */
  duration?: number;
  /** Resolves the full-quality file only when the user actually picks it. */
  load: () => Promise<File>;
}

export type GalleryMode = 'library' | 'system-gallery' | 'web';

let capacitor: typeof import('@capacitor/core').Capacitor | null = null;

async function getCapacitor() {
  if (!capacitor) {
    const mod = await import('@capacitor/core');
    capacitor = mod.Capacitor;
  }
  return capacitor;
}

export async function detectMode(): Promise<GalleryMode> {
  try {
    const Cap = await getCapacitor();
    if (!Cap.isNativePlatform()) return 'web';
    return Cap.getPlatform() === 'ios' ? 'library' : 'system-gallery';
  } catch {
    return 'web';
  }
}

async function urlToFile(url: string, name: string, fallbackType: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || fallbackType });
}

/** iOS: read the camera roll and return thumbnails for our own grid. */
export async function loadDeviceLibrary(quantity = 300): Promise<DeviceMedia[]> {
  const Cap = await getCapacitor();
  const { Media } = await import('@capacitor-community/media');

  const { medias } = await Media.getMedias({
    quantity,
    thumbnailWidth: 320,
    thumbnailHeight: 320,
    thumbnailQuality: 70,
    types: 'all',
    sort: [{ key: 'creationDate', ascending: false }],
  });

  return medias.map((asset, index) => {
    const kind: 'image' | 'video' = asset.duration ? 'video' : 'image';
    return {
      id: asset.identifier ?? `asset-${index}`,
      kind,
      preview: asset.data ? `data:image/jpeg;base64,${asset.data}` : '',
      duration: asset.duration,
      load: async () => {
        const { path } = await Media.getMediaByIdentifier({ identifier: asset.identifier });
        return urlToFile(
          Cap.convertFileSrc(path),
          path.split('/').pop() || `media-${index}`,
          kind === 'video' ? 'video/mp4' : 'image/jpeg'
        );
      },
    };
  });
}

/**
 * Android: open the system photo picker (gallery grid, multi-select) and hand
 * the chosen photos/videos back for curation in our composer.
 */
export async function pickFromSystemGallery(limit: number): Promise<DeviceMedia[]> {
  const Cap = await getCapacitor();
  const { FilePicker } = await import('@capawesome/capacitor-file-picker');

  const { files } = await FilePicker.pickMedia({ limit, readData: false });

  return files.map((file, index) => {
    const mime = file.mimeType || '';
    const kind: 'image' | 'video' = mime.startsWith('video') ? 'video' : 'image';
    const src = file.path ? Cap.convertFileSrc(file.path) : '';
    return {
      id: `${file.name ?? 'media'}-${file.size ?? index}-${index}`,
      kind,
      preview: kind === 'image' ? src : '',
      duration: typeof file.duration === 'number' ? file.duration / 1000 : undefined,
      load: async () => {
        if (file.blob) return new File([file.blob], file.name ?? `media-${index}`, { type: mime });
        return urlToFile(src, file.name ?? `media-${index}`, mime || 'application/octet-stream');
      },
    };
  });
}

export function formatDuration(seconds?: number) {
  if (!seconds || !isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
