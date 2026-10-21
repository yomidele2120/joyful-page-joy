// Pure helpers for the server-side product list (no network, easy to test).

export const PRODUCT_PAGE_SIZE = 24;
/** The most pages a visitor can page through. Deeper than this is slow for the database and not useful
 *  to a buyer: narrow the search or add filters instead. 100 pages x 24 = 2,400 products. */
export const MAX_PRODUCT_PAGES = 100;

export type ProductSort = 'newest' | 'price-low' | 'price-high' | 'moq-low';

/**
 * Turns what the visitor typed into a word-start full-text query: "iph 15" becomes "iph:* & 15:*",
 * which matches "iPhone 15 Pro". Only letters and numbers survive, so nothing typed can break the query.
 * Returns null when there is nothing searchable.
 */
export function toPrefixQuery(raw: string): string | null {
  const tokens = (raw.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 6);
  return tokens.length ? tokens.map(t => `${t}:*`).join(' & ') : null;
}

/** Text safe to put inside an ILIKE pattern (wildcards and list separators removed). */
export function cleanLike(raw: string): string {
  return raw.replace(/[%_*\\,()"']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Columns and directions for each sort option. The id is always the last key so pages never repeat or skip rows. */
export function sortKeys(sort: ProductSort | undefined): { column: string; ascending: boolean }[] {
  switch (sort) {
    case 'price-low': return [{ column: 'price_min', ascending: true }, { column: 'id', ascending: true }];
    case 'price-high': return [{ column: 'price_min', ascending: false }, { column: 'id', ascending: false }];
    case 'moq-low': return [{ column: 'moq', ascending: true }, { column: 'id', ascending: true }];
    default: return [{ column: 'created_at', ascending: false }, { column: 'id', ascending: false }];
  }
}

/** Pages to show for a (possibly estimated) total, never more than the cap. */
export function pageCountFor(total: number, pageSize = PRODUCT_PAGE_SIZE, maxPages = MAX_PRODUCT_PAGES) {
  const raw = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  return { pageCount: Math.min(raw, maxPages), capped: raw > maxPages };
}

/** The database stops counting a supplier's products here (counting a million per supplier is slow). */
export const SUPPLIER_COUNT_CAP = 10_000;

/** "42" for small catalogues, "10,000+" once the count hit the cap. */
export function formatSupplierProductCount(count: number): string {
  return count >= SUPPLIER_COUNT_CAP ? `${SUPPLIER_COUNT_CAP.toLocaleString('en-NG')}+` : String(count);
}

/** Large totals come from the database's estimate, so they are shown as approximate. */
export function formatProductCount(total: number): string {
  const text = total.toLocaleString('en-NG');
  return total > 5000 ? `About ${text}` : text;
}
