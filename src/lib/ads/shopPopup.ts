// Themes and once-per-visit memory for the shop's social pop-up. Pure and small so it can be tested.
export interface PopupTheme { card: string; glow: string; badge: string; button: string; spark: [string, string]; title: (platform: string) => string; line: (shop: string) => string }

export const POPUP_THEMES: PopupTheme[] = [
  { card: 'linear-gradient(180deg,#fff4e3 0%,#ffd9b0 100%)', glow: '#ff9a3c', badge: 'linear-gradient(135deg,#f58529,#dd2a7b 55%,#8134af)', button: 'linear-gradient(180deg,#ffb23f,#ff8a00)', spark: ['✨', '💛'], title: (p) => `Follow us on ${p}`, line: (s) => `New arrivals and offers from ${s}` },
  { card: 'linear-gradient(180deg,#e6f7ff 0%,#b8e4ff 100%)', glow: '#38b6ff', badge: 'linear-gradient(135deg,#0ea5e9,#2563eb)', button: 'linear-gradient(180deg,#7ee0ff,#38b6ff)', spark: ['💬', '⭐'], title: (p) => `Join us on ${p}`, line: (s) => `See what ${s} is up to, first` },
  { card: 'linear-gradient(180deg,#eafff0 0%,#bff2cf 100%)', glow: '#34d399', badge: 'linear-gradient(135deg,#10b981,#047857)', button: 'linear-gradient(180deg,#a3f0b9,#4ade80)', spark: ['🌿', '✨'], title: (p) => `Stay in touch on ${p}`, line: (s) => `Fresh picks and updates from ${s}` },
  { card: 'linear-gradient(180deg,#f6ecff 0%,#dcc2ff 100%)', glow: '#a855f7', badge: 'linear-gradient(135deg,#a855f7,#6d28d9)', button: 'linear-gradient(180deg,#f0a8ff,#c77dff)', spark: ['💜', '🎉'], title: (p) => `Come say hi on ${p}`, line: (s) => `Be part of the ${s} community` },
];
export const POPUP_DELAY_MS = 3500;

const key = (vendorId: string) => `shop-popup-seen:${vendorId}`;
const store = (): Storage | undefined => { try { return window.sessionStorage; } catch { return undefined; } };
export const popupSeen = (vendorId: string): boolean => { try { return store()?.getItem(key(vendorId)) === '1'; } catch { return false; } };
export const markPopupSeen = (vendorId: string): void => { try { store()?.setItem(key(vendorId), '1'); } catch { /* storage unavailable: it may show again on refresh */ } };

/** A different theme on each visit: the visit number (kept in the browser) steps through the list, offset per shop. */
export function pickPopupTheme(vendorId: string, visit = readVisit()): number {
  let h = 0;
  for (let i = 0; i < vendorId.length; i++) h = (h * 31 + vendorId.charCodeAt(i)) >>> 0;
  return (h + visit) % POPUP_THEMES.length;
}
function readVisit(): number {
  try {
    const s = window.localStorage; const n = (parseInt(s.getItem('shop-popup-visits') ?? '0', 10) || 0);
    return n;
  } catch { return Math.floor(Math.random() * POPUP_THEMES.length); }
}
/** Call once per visit (after the popup opens) so the next visit uses the next theme. */
export function bumpVisit(): void {
  try { const s = window.localStorage; s.setItem('shop-popup-visits', String((parseInt(s.getItem('shop-popup-visits') ?? '0', 10) || 0) + 1)); } catch { /* ignore */ }
}
