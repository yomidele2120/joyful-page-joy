// How long public (not signed-in) data may be reused before the shop asks the server again.
// Every visitor sees the same products, categories and flyers, so a short shared-style cache saves
// most database reads without anyone seeing meaningfully old data. Edits made by an admin or supplier
// call invalidateQueries, so they show up straight away for the person who made them.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const CACHE = {
  /** Product lists and single products: fresh for 5 minutes. */
  products: { staleTime: 5 * MINUTE, gcTime: 24 * HOUR },
  /** Categories almost never change. */
  categories: { staleTime: 30 * MINUTE, gcTime: 24 * HOUR },
  /** Homepage counts and the supplier directory. */
  directory: { staleTime: 10 * MINUTE, gcTime: 24 * HOUR },
  /** Promo flyers: admins expect uploads to show quickly. */
  flyers: { staleTime: 2 * MINUTE, gcTime: 24 * HOUR },
} as const;

/** Longest a saved copy may be used to paint the page instantly before it is refreshed. */
export const PERSIST_MAX_AGE = 24 * HOUR;
