// Fair rotation of homepage ads. Pure functions: the same inputs and seed always give the same result, so it is testable.
// The database already filters out expired, unpaid, unapproved and exhausted campaigns; the checks here are a second line.

export interface RotatableAd {
  id: string;
  vendor_id: string;
  priority: number;                 // admin-set, higher = more weight
  impressions_count: number;
  clicks_count: number;
  priority_weight?: number | null;  // plan tier weight (higher plans get more exposure)
  impression_allocation?: number | null;   // plan cap; null = unlimited
  boost_remaining?: number | null;         // paid extra views still to be shown
}

export interface PickOptions {
  limit: number;
  seed: number | string;
  recentIds?: readonly string[];    // shown recently; lowered, not banned, so a small pool still fills
  onePerVendor?: boolean;           // default true
}

/** Small deterministic PRNG (mulberry32). */
export function seededRandom(seed: number | string): () => number {
  let h = 1779033703;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^= h >>> 16) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const isExhausted = (ad: RotatableAd) =>
  ad.impression_allocation != null && ad.impressions_count >= ad.impression_allocation && !(Number(ad.boost_remaining) > 0);

/** Click-through rate with a prior so a brand-new ad is neither punished nor over-rewarded. */
export function smoothedCtr(ad: Pick<RotatableAd, 'impressions_count' | 'clicks_count'>): number {
  return (Math.max(0, ad.clicks_count) + 1) / (Math.max(0, ad.impressions_count) + 40);
}

/**
 * Weight used for the draw. Tier weight and admin priority raise it; ads that have had fewer impressions than their
 * peers are boosted (fairness); better click-through nudges it up (bounded to 0.6x..1.6x so it cannot dominate).
 */
export function adWeight(ad: RotatableAd, pool: readonly RotatableAd[]): number {
  const tier = Math.max(1, Number(ad.priority_weight) || 1);
  const priority = 1 + Math.min(Math.max(Number(ad.priority) || 0, 0), 100) / 20;           // 1..6
  const avgImpr = pool.length ? pool.reduce((s, a) => s + Math.max(0, a.impressions_count), 0) / pool.length : 0;
  const fairness = Math.min(3, Math.max(0.4, (avgImpr + 10) / (Math.max(0, ad.impressions_count) + 10)));
  const avgCtr = pool.length ? pool.reduce((s, a) => s + smoothedCtr(a), 0) / pool.length : smoothedCtr(ad);
  const perf = Math.min(1.6, Math.max(0.6, smoothedCtr(ad) / (avgCtr || 1)));
  const boost = Number(ad.boost_remaining) > 0 ? 2 : 1;   // paid views are delivered preferentially
  return tier * priority * fairness * perf * boost;
}

/** Weighted draw without replacement; at most one ad per vendor; recently shown ads are down-weighted. */
export function pickAds<T extends RotatableAd>(ads: readonly T[], opts: PickOptions): T[] {
  const limit = Math.max(0, Math.floor(opts.limit));
  if (!limit) return [];
  const seen = new Set<string>();
  const pool = ads.filter((a) => !isExhausted(a) && !seen.has(a.id) && (seen.add(a.id), true));
  const recent = new Set(opts.recentIds ?? []);
  const rand = seededRandom(opts.seed);
  const out: T[] = [];
  const usedVendors = new Set<string>();
  let candidates = [...pool];
  while (out.length < limit && candidates.length) {
    const weights = candidates.map((a) => adWeight(a, pool) * (recent.has(a.id) ? 0.15 : 1));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < candidates.length - 1; idx++) { r -= weights[idx]; if (r <= 0) break; }
    const chosen = candidates[idx];
    out.push(chosen);
    usedVendors.add(chosen.vendor_id);
    candidates = candidates.filter((a) => a.id !== chosen.id && !(opts.onePerVendor !== false && a.vendor_id === chosen.vendor_id));
  }
  // If one-per-vendor left the list short (a small pool), fill from what remains so slots are not wasted.
  if (out.length < limit && opts.onePerVendor !== false) {
    const rest = pool.filter((a) => !out.includes(a));
    for (const a of rest) { if (out.length >= limit) break; out.push(a); }
  }
  return out;
}

/** Index of the ad shown in a time-rotating slot. */
export function rotationIndex(nowMs: number, rotationMinutes: number, count: number): number {
  if (count <= 0) return 0;
  const period = Math.max(1, rotationMinutes) * 60_000;
  return Math.floor(nowMs / period) % count;
}

/**
 * Where sponsored rows go among product rows: after every `interval` rows (interval 3 -> after row 3, 6, 9 ...),
 * never after the last row, at most `maxRows` of them. interval < 1 means none.
 */
export function sponsoredRowSlots(productRowCount: number, interval: number, maxRows: number): number[] {
  const every = Math.floor(interval);
  if (!(every >= 1) || maxRows <= 0 || productRowCount <= 0) return [];
  const slots: number[] = [];
  for (let after = every; after < productRowCount && slots.length < maxRows; after += every) slots.push(after);
  return slots;
}
