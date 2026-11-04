// Small helpers for TikTok posts shown in the feed. The embed address is only ever trusted in this exact shape:
// the database enforces the same pattern, and the player below refuses anything else.
const EMBED = /^https:\/\/www\.tiktok\.com\/embed\/v2\/([0-9]{6,25})$/;

/** The numeric TikTok video id for a valid embed address, otherwise null. */
export function tiktokVideoId(embedUrl: string | null | undefined): string | null {
  const m = EMBED.exec(embedUrl ?? '');
  return m ? m[1] : null;
}

export function tiktokPlayerUrl(embedUrl: string | null | undefined): string | null {
  const id = tiktokVideoId(embedUrl);
  return id
    ? `https://www.tiktok.com/player/v1/${id}?autoplay=1&loop=1&muted=1&controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0&timestamp=0&music_info=0&description=0&closed_caption=0&rel=0`
    : null;
}

export function tiktokPlayerErrorMessage(value: unknown): string {
  if (!value || typeof value !== 'object') return 'TikTok could not play this video. Try again later.';
  const error = value as { errorCode?: unknown; errorType?: unknown };
  if (error.errorCode === 2001 || error.errorType === 'SERVER_ERROR') {
    return 'TikTok temporarily limited its embedded player for this site. Try again later.';
  }
  if (error.errorCode === 3002 || error.errorType === 'AUTOPLAY_ERROR') {
    return 'TikTok could not start automatically. Tap Try again to retry playback.';
  }
  return 'TikTok could not play this video. Try again later.';
}

export const isTikTokPost = (p: { media_type?: string | null; tiktok_embed_url?: string | null }) =>
  p.media_type === 'tiktok' && tiktokVideoId(p.tiktok_embed_url) !== null;
