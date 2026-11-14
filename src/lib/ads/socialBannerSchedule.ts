// When to show the floating social banner on a shop page. State lives in the visitor's browser (localStorage);
// all the numbers come from the admin's settings, so nothing here is hard-coded policy.

export interface SocialBannerSettings { display_minutes: number; rotation_minutes: number; max_per_day: number; dismiss_hours: number }
export interface SocialBannerState {
  day: string;                    // local calendar day, YYYY-MM-DD
  shownToday: number;
  lastShownAt: number | null;     // ms
  dismissedUntil: number | null;  // ms
  rotation: number;               // which account is next
}
export const emptySocialState = (now: number): SocialBannerState => ({ day: dayKey(now), shownToday: 0, lastShownAt: null, dismissedUntil: null, rotation: 0 });

export const dayKey = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** Normalises stored state (new day resets the daily counter; garbage becomes a clean state). */
export function loadSocialState(raw: unknown, now: number): SocialBannerState {
  const s = raw && typeof raw === 'object' ? (raw as Partial<SocialBannerState>) : {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const base: SocialBannerState = {
    day: typeof s.day === 'string' ? s.day : dayKey(now),
    shownToday: Math.max(0, Math.floor(num(s.shownToday) ?? 0)),
    lastShownAt: num(s.lastShownAt), dismissedUntil: num(s.dismissedUntil), rotation: Math.max(0, Math.floor(num(s.rotation) ?? 0)),
  };
  return base.day === dayKey(now) ? base : { ...base, day: dayKey(now), shownToday: 0 };
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
