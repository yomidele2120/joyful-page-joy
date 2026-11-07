// Small helpers for TikTok posts shown in the feed. The embed address is only ever trusted in this exact shape:
// the database enforces the same pattern, and the player below refuses anything else.
const EMBED = /^https:\/\/www\.tiktok\.com\/embed\/v2\/([0-9]{6,25})$/;

/** The numeric TikTok video id for a valid embed address, otherwise null. */
export function tiktokVideoId(embedUrl: string | null | undefined): string | null {
  const m = EMBED.exec(embedUrl ?? '');
  return m ? m[1] : null;
}

export const isTikTokPost = (p: { media_type?: string | null; tiktok_embed_url?: string | null }) =>
  p.media_type === 'tiktok' && tiktokVideoId(p.tiktok_embed_url) !== null;
