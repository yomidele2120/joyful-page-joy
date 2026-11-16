// Is a product picture link really a picture? Used by auto-product-images to find BROKEN pictures.
// "broken" is only returned for a definite failure (404/410, or a 200 that is not an image, e.g. a web page).
// Timeouts, 5xx, 403 and other doubts are "unknown": they never cause a picture to be replaced.
export type LinkState = 'ok' | 'broken' | 'unknown';

export function classify(status: number, contentType: string | null): LinkState {
  if (status === 404 || status === 410) return 'broken';
  if (status >= 200 && status < 300) return /^image\//i.test(contentType ?? '') ? 'ok' : (contentType ? 'broken' : 'unknown');
  return 'unknown';
}

/** Only public https links to a hostname (never an IP address or a local name). */
export function isCheckable(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (!h.includes('.') || /^[\d.]+$/.test(h) || h.includes(':') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return false;
    return true;
  } catch { return false; }
}

export async function checkLink(url: string): Promise<LinkState> {
  if (!isCheckable(url)) return 'unknown';
  try {
    const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0', 'User-Agent': 'ITHUBAFRICA-image-check' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
    try { await res.body?.cancel(); } catch { /* ignore */ }
    return classify(res.status, res.headers.get('content-type'));
  } catch { return 'unknown'; }
}

/** A product is broken only when every one of its pictures is definitely broken. */
export function productState(states: LinkState[]): LinkState {
  if (!states.length) return 'unknown';
  if (states.every((s) => s === 'broken')) return 'broken';
  if (states.some((s) => s === 'ok')) return 'ok';
  return 'unknown';
}
