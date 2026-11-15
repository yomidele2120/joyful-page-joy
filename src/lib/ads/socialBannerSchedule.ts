// When to show the floating social banner on a shop page. State lives in the visitor's browser (localStorage);
// all the numbers come from the admin's settings, so nothing here is hard-coded policy.

export interface SocialBannerSettings { display_minutes: number; rotation_minutes: number; max_per_day: number; dismiss_hours: number }
export interface SocialBannerState {
  day: string;                    // local calendar day, YYYY-MM-DD
  shownToday: number;
  lastShownAt: number | null;     // ms
  dismissedUntil: number | null;  // ms (older global dismissal; the banner now dismisses one account at a time, see `dismissed`)
  rotation: number;               // which account is next
  dismissed: Record<string, number>;   // account id -> ms until which that one account stays hidden
}
export const emptySocialState = (now: number): SocialBannerState => ({ day: dayKey(now), shownToday: 0, lastShownAt: null, dismissedUntil: null, rotation: 0, dismissed: {} });

export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Normalises stored state (new day resets the daily counter; garbage becomes a clean state). */
export function loadSocialState(raw: unknown, now: number): SocialBannerState {
  const s = raw && typeof raw === 'object' ? (raw as Partial<SocialBannerState>) : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const base: SocialBannerState = {
    day: typeof s.day === 'string' ? s.day : dayKey(now),
    shownToday: Math.max(0, Math.floor(num(s.shownToday) ?? 0)),
    lastShownAt: num(s.lastShownAt), dismissedUntil: num(s.dismissedUntil), rotation: Math.max(0, Math.floor(num(s.rotation) ?? 0)),
    dismissed: cleanDismissed((s as Partial<SocialBannerState>).dismissed, now),
  };
  return base.day === dayKey(now) ? base : { ...base, day: dayKey(now), shownToday: 0 };
}

/** Keeps only well-formed, still-running account dismissals (garbage or expired entries are dropped). */
function cleanDismissed(raw: unknown, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > now && k.length <= 64) out[k] = v;
  }
  return out;
}

export function shouldShowSocialBanner(state: SocialBannerState, settings: SocialBannerSettings, now: number): boolean {
  if (state.dismissedUntil != null && now < state.dismissedUntil) return false;
  if (state.shownToday >= Math.max(0, settings.max_per_day)) return false;
  if (state.lastShownAt != null && now - state.lastShownAt < Math.max(0, settings.rotation_minutes) * 60_000) return false;
  return true;
}
export const markSocialShown = (state: SocialBannerState, now: number): SocialBannerState =>
  ({ ...state, day: dayKey(now), shownToday: state.shownToday + 1, lastShownAt: now, rotation: state.rotation + 1 });
export const markSocialDismissed = (state: SocialBannerState, settings: SocialBannerSettings, now: number): SocialBannerState =>
  ({ ...state, dismissedUntil: now + Math.max(0, settings.dismiss_hours) * 3_600_000 });
export const socialHideAt = (shownAt: number, settings: SocialBannerSettings) => shownAt + Math.max(1, settings.display_minutes) * 60_000;
export function pickSocialAccount<T>(accounts: readonly T[], rotation: number): T | null {
  return accounts.length ? accounts[((rotation % accounts.length) + accounts.length) % accounts.length] : null;
}

/** Closing the banner hides only that account (for dismiss_hours). The visitor's other accounts can still be shown. */
export const dismissSocialAccount = (state: SocialBannerState, id: string, settings: SocialBannerSettings, now: number): SocialBannerState =>
  ({ ...state, dismissed: { ...state.dismissed, [id]: now + Math.max(0, settings.dismiss_hours) * 3_600_000 } });
/** The accounts that have not been closed by this visitor. */
export const availableSocialAccounts = <T extends { id: string }>(accounts: readonly T[], state: SocialBannerState, now: number): T[] =>
  accounts.filter((a) => !(state.dismissed[a.id] > now));
/** Which side of the screen the card is on: it swaps every few seconds. */
export const socialSide = (tick: number): 'left' | 'right' => (tick % 2 === 0 ? 'right' : 'left');
