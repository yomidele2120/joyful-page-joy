// Links to a single video post, and the "Share" action used everywhere a post can be shared.
//
// A shared link opens the feed anchored on that exact post (the feed already supports ?post=ID), and it works
// for people who are not signed in. When the link is pasted into WhatsApp, Facebook, Telegram and similar apps,
// api/share.ts answers their preview request with the video's title and thumbnail.

export const postPath = (postId: string) => `/feed?post=${encodeURIComponent(postId)}`;

export function postShareUrl(postId: string, origin: string = window.location.origin): string {
  return `${origin}${postPath(postId)}`;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the old way (works on plain http and in some in-app browsers)
  }
  try {
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.position = 'fixed';
    box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(box);
    return ok;
  } catch {
    return false;
  }
}

/** Opens the phone's share sheet when there is one, otherwise copies the link. */
export async function sharePost(post: { id: string; vendorName?: string | null; caption?: string | null }): Promise<ShareResult> {
  const url = postShareUrl(post.id);
  const caption = (post.caption ?? '').trim();
  const data: ShareData = {
    title: post.vendorName ? `${post.vendorName} on IT Hub Africa` : 'Watch this on IT Hub Africa',
    text: caption ? (caption.length > 100 ? `${caption.slice(0, 97)}...` : caption) : undefined,
    url,
  };
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'; // they closed the share sheet on purpose
    }
  }
  return (await copyText(url)) ? 'copied' : 'failed';
}
