// Where sponsored cards go inside a product grid. Pure functions, so the rules are testable.

export interface FeedSlotOptions {
  itemCount: number;               // products on this page
  first?: number;                  // first card goes after this many products (default 4)
  every?: number;                  // then after every this many more products (default 8)
  max?: number;                    // at most this many cards per page (default 3)
  minAfter?: number;               // keep at least this many products after a card, so it never ends the page (default 2)
  reserved?: readonly number[];    // 0-based product positions that already have something after them (flyers)
}

/** 0-based product indexes after which a sponsored card is placed. A slot that lands on a reserved position moves one product on. */
export function feedSlots(o: FeedSlotOptions): number[] {
  const first = Math.floor(o.first ?? 4);
  const every = Math.floor(o.every ?? 8);
  const max = Math.floor(o.max ?? 3);
  const minAfter = Math.max(0, Math.floor(o.minAfter ?? 2));
  const reserved = new Set(o.reserved ?? []);
  if (!(o.itemCount > 0) || first < 1 || every < 1 || max < 1) return [];
  const out: number[] = [];
  let idx = first - 1;
  while (out.length < max) {
    while (reserved.has(idx)) idx += 1;
    if (idx > o.itemCount - 1 - minAfter) break;
    out.push(idx);
    idx += every;
  }
  return out;
}
