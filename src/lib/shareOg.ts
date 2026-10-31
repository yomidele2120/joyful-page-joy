// The small HTML page that WhatsApp, Facebook, Telegram, X and other link-preview robots read when someone pastes
// a video link. People never see it: the shared link rewrites to api/share.ts only for those robots (see vercel.json).
// Pure functions so they can be tested without a server.

export interface SharePost {
  id: string;
  caption?: string | null;
  thumbnail_url?: string | null;
  image_urls?: string[] | null;
  media_type?: string | null;
  vendors?: { store_name?: string | null } | null;
  products?: { name?: string | null } | null;
}

export const SITE_NAME = 'IT Hub Africa';

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}\u2026`;
}

const isHttps = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/\S+$/.test(u);

export function previewImage(post: SharePost): string | null {
  if (isHttps(post.thumbnail_url)) return post.thumbnail_url;
  const first = post.image_urls?.find(isHttps);
  return first ?? null;
}

export function buildShareHtml(post: SharePost | null, origin: string): string {
  const siteUrl = origin.replace(/\/$/, '');
  const url = post ? `${siteUrl}/feed?post=${encodeURIComponent(post.id)}` : siteUrl;

  let title = `${SITE_NAME} - Buy, Sell, and Grow With Confidence`;
  let description = 'Discover products and videos from trusted suppliers.';
  let image: string | null = null;

  if (post) {
    const store = post.vendors?.store_name?.trim();
    const isVideo = post.media_type !== 'images';
    title = truncate(`${store ? `${store}: ` : ''}${isVideo ? 'Watch this video' : 'See these photos'} on ${SITE_NAME}`, 90);
    const caption = (post.caption ?? '').trim();
    const product = post.products?.name?.trim();
    description = truncate(caption || (product ? `Featured product: ${product}` : 'Watch now and shop the products shown.'), 200);
    image = previewImage(post);
  }

  const t = escapeHtml(title), d = escapeHtml(description), u = escapeHtml(url);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${u}">
<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${u}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}">\n<meta property="og:image:alt" content="${t}">\n` : ''}<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}">\n` : ''}</head>
<body>
<p><a href="${u}">${t}</a></p>
</body>
</html>`;
}
