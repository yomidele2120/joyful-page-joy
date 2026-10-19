import { dehydrate, hydrate, type Query, type QueryClient } from '@tanstack/react-query';
import { CACHE, PERSIST_MAX_AGE } from './cachePolicy';

// Saves the shop's PUBLIC data (products, categories, flyers, directory) in the browser, so a returning
// visitor sees the page immediately while fresh data loads in the background.
// Only the query names listed below are ever saved. Anything tied to a signed-in person (orders,
// wishlist, profile, admin and supplier data) is never written to storage.

const BUILD = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

export const STORAGE_KEY = 'ithub-public-cache';
const MAX_BYTES = 1_500_000;
const SAVE_DELAY_MS = 2_000;

const PUBLIC_ROOTS = new Set(['products', 'product', 'categories', 'flyers', 'marketplace-stats', 'suppliers']);

export const isPublicQuery = (query: Pick<Query, 'queryKey' | 'state'>): boolean => {
  if (query.state.status !== 'success') return false;
  const [root, variant] = query.queryKey;
  // The admin's category list also contains hidden categories, so only the public (visible) list is saved.
  if (root === 'categories') return variant === 'visible';
  return PUBLIC_ROOTS.has(String(root));
};

interface Saved { build: string; savedAt: number; state: ReturnType<typeof dehydrate> }

/** Put saved public data back into the cache. Call once, before the first render. */
export function restoreQueryCache(client: QueryClient, now = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as Saved;
    // A new deploy may change the shape of the data, so a copy from another build is dropped.
    if (saved.build !== BUILD || now - saved.savedAt > PERSIST_MAX_AGE || !saved.state) {
      window.localStorage.removeItem(STORAGE_KEY);
      return false;
    }
    hydrate(client, saved.state, { defaultOptions: { queries: { gcTime: CACHE.products.gcTime } } });
    return true;
  } catch {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
    return false;
  }
}

/** Save public data now (throws away the saved copy if it would be too big). */
export function saveQueryCache(client: QueryClient, now = Date.now()): void {
  try {
    const state = dehydrate(client, { shouldDehydrateQuery: isPublicQuery });
    if (!state.queries.length) return;
    const json = JSON.stringify({ build: BUILD, savedAt: now, state } satisfies Saved);
    if (json.length > MAX_BYTES) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Private mode or a full disk: the shop works the same, just without the saved copy.
  }
}

/** Keep the saved copy up to date (a few seconds after the last change). Returns a function that stops it. */
export function persistQueryCache(client: QueryClient): () => void {
  let timer: number | undefined;
  const flush = () => {
    if (timer !== undefined) { window.clearTimeout(timer); timer = undefined; }
    saveQueryCache(client);
  };
  const unsubscribe = client.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || !isPublicQuery(event.query)) return;
    if (timer === undefined) timer = window.setTimeout(flush, SAVE_DELAY_MS);
  });
  window.addEventListener('pagehide', flush);
  return () => {
    unsubscribe();
    window.removeEventListener('pagehide', flush);
    if (timer !== undefined) window.clearTimeout(timer);
  };
}
