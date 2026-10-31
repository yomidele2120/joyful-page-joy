// Shared, plain-TypeScript rules for the Cloudflare Stream video pipeline (used by create-stream-upload,
// stream-webhook and check-stream-post). It reads no environment, so the app's own tests can run it too.

export const MAX_UPLOAD_BYTES = 600 * 1024 * 1024; // the app lets sellers pick up to 500 MB; a little headroom
export const MAX_DURATION_SECONDS = 180;
// An upload nobody finished is given up on after this long.
export const ABANDON_AFTER_HOURS = 72;

export const hlsUrlFor = (uid: string) => `https://videodelivery.net/${uid}/manifest/video.m3u8`;
export const thumbnailUrlFor = (uid: string) => `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=0.5s`;

// What Cloudflare tells us about a video (the webhook body and the "get video" API result share this shape).
export interface StreamVideo {
  uid?: string;
  readyToStream?: boolean;
  duration?: number;
  status?: {
    state?: string; // pendingupload | downloading | queued | inprogress | ready | error
    pctComplete?: string | number;
    errReasonCode?: string;
    errorReasonCode?: string;
    errReasonText?: string;
    errorReasonText?: string;
  };
}

export type PostOutcome = 'ready' | 'failed' | 'processing' | 'uploading' | 'unchanged';

export function friendlyStreamError(code?: string, text?: string): string {
  switch (code) {
    case 'ERR_DURATION_EXCEED_CONSTRAINT':
      return `This video is longer than ${MAX_DURATION_SECONDS / 60} minutes. Please trim it and post again.`;
    case 'ERR_NON_VIDEO':
    case 'ERR_MALFORMED_VIDEO':
      return 'This file could not be read as a video. Please try a different video.';
    case 'ERR_INVALID_VIDEO_DIMENSIONS':
      return 'This video has unsupported dimensions.';
    default:
      return text || (code ? `Video processing failed (${code}).` : 'Video processing failed. Please try again.');
  }
}

// deno-lint-ignore no-explicit-any
type Admin = any; // a service-role Supabase client

/**
 * Moves the post that belongs to this Cloudflare video to its next stage.
 * Only touches posts that are still unfinished, so it never undoes a post that was removed by a moderator,
 * and it is safe to run twice (the webhook and the polling fallback can both report the same video).
 */
export async function applyStreamState(admin: Admin, video: StreamVideo): Promise<PostOutcome> {
  const uid = video.uid;
  if (!uid) return 'unchanged';
  const state = video.status?.state;
  const unfinished = ['uploading', 'processing'];

  if (state === 'error') {
    const code = video.status?.errReasonCode ?? video.status?.errorReasonCode;
    const text = video.status?.errReasonText ?? video.status?.errorReasonText;
    await admin.from('posts')
      .update({ processing_status: 'failed', processing_error: friendlyStreamError(code, text), is_active: false })
      .eq('stream_uid', uid).in('processing_status', unfinished);
    return 'failed';
  }

  // Playable as soon as one quality level is encoded; the rest arrive while people already watch.
  if (video.readyToStream === true || state === 'ready') {
    const patch: Record<string, unknown> = { processing_status: 'ready', processing_error: null, is_active: true };
    if (typeof video.duration === 'number' && video.duration > 0) patch.duration_seconds = video.duration;
    await admin.from('posts').update(patch).eq('stream_uid', uid).in('processing_status', unfinished);
    return 'ready';
  }

  if (state === 'pendingupload') return 'uploading';

  // downloading / queued / inprogress: the whole file has arrived and Cloudflare is working on it.
  await admin.from('posts').update({ processing_status: 'processing' }).eq('stream_uid', uid).eq('processing_status', 'uploading');
  return 'processing';
}
