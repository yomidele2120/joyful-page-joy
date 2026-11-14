// Mirror of the database function ad_normalize_social(). The database is the authority (it re-checks everything on save);
// this copy only gives vendors instant, friendly feedback. Links only: no passwords, no OAuth, no tokens.

export type SocialPlatform = 'instagram' | 'facebook' | 'tiktok';
export const SOCIAL_PLATFORMS: readonly SocialPlatform[] = ['instagram', 'facebook', 'tiktok'];
export type SocialResult = { ok: true; url: string; handle: string } | { ok: false; error: string };

const fail = (error: string): SocialResult => ({ ok: false, error });
const IG_BLOCK = ['p', 'reel', 'reels', 'explore', 'accounts', 'stories', 'direct', 'tv', 'about', 'developer', 'legal'];
const FB_BLOCK = ['profile.php', 'sharer', 'sharer.php', 'share', 'groups', 'watch', 'marketplace', 'pages', 'people', 'events',
  'login', 'dialog', 'plugins', 'tr', 'l.php', 'policy', 'help', 'gaming', 'stories', 'reel'];

export function normalizeSocial(platform: string, rawUrl: string, rawHandle = ''): SocialResult {
  const u = (rawUrl ?? '').trim();
  if (!/^https:\/\/[^/?#@\s:]+(\/[^?#\s]*)?([?#].*)?$/i.test(u)) {
    return fail('Profile link must start with https:// and must not contain a username, password or port.');
  }
  const host = /^https:\/\/([^/?#]+)/i.exec(u)![1].toLowerCase();
  const path = /^https:\/\/[^/?#]+(\/[^?#]*)/i.exec(u)?.[1] ?? '';
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return fail('The link must point to a profile, not the home page.');
  if (trimmed.includes('/')) return fail('The link must go to the profile itself (no extra path).');
  const given = (rawHandle ?? '').trim().replace(/^@/, '').toLowerCase();
  let handle: string; let canon: string;

  if (platform === 'instagram') {
    if (!['instagram.com', 'www.instagram.com'].includes(host)) return fail('That is not an Instagram link.');
    if (!/^[A-Za-z0-9._]{1,30}$/.test(trimmed) || IG_BLOCK.includes(trimmed.toLowerCase())) return fail('That does not look like an Instagram profile.');
    handle = trimmed; canon = `https://www.instagram.com/${trimmed}/`;
  } else if (platform === 'facebook') {
    if (!['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(host)) return fail('That is not a Facebook link.');
    if (!/^[A-Za-z0-9.]{5,50}$/.test(trimmed) || FB_BLOCK.includes(trimmed.toLowerCase())) return fail('That does not look like a Facebook page.');
    handle = trimmed; canon = `https://www.facebook.com/${trimmed}`;
  } else if (platform === 'tiktok') {
    if (!['tiktok.com', 'www.tiktok.com'].includes(host)) return fail('That is not a TikTok link.');
    if (!/^@[A-Za-z0-9._]{2,24}$/.test(trimmed)) return fail('TikTok profile links look like tiktok.com/@yourname.');
    handle = trimmed.slice(1); canon = `https://www.tiktok.com/@${handle}`;
  } else {
    return fail('Unsupported platform.');
  }
  if (given && given !== handle.toLowerCase()) return fail('The handle does not match the profile link.');
  return { ok: true, url: canon, handle };
}

/** Only ever open links that are exactly one of the three known profile hosts (defence in depth before rendering an <a>). */
export function isSafeSocialUrl(platform: string, url: string): boolean {
  return normalizeSocial(platform, url).ok;
}
