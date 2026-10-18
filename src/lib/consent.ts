// Cookie / browser-storage consent.
//
// Essential storage (sign-in session, cart, payments, the consent record itself) is always on.
// Optional categories ("analytics", "marketing") stay OFF until the visitor says yes, and nothing
// optional may be loaded before that. Load optional scripts only through loadScriptWithConsent().

export type OptionalCategory = 'analytics' | 'marketing';
export type ConsentCategory = 'essential' | OptionalCategory;

export interface ConsentState {
  version: number;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}

// Bump this when the cookie policy changes in a way that needs fresh consent.
export const CONSENT_VERSION = 1;
const STORAGE_KEY = 'ithub.cookie-consent';
const EVENT_NAME = 'ithub:consent-changed';

export function getStoredConsent(): ConsentState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed.version !== CONSENT_VERSION) return null; // old policy version: ask again
    if (typeof parsed.analytics !== 'boolean' || typeof parsed.marketing !== 'boolean') return null;
    return { version: CONSENT_VERSION, analytics: parsed.analytics, marketing: parsed.marketing, decidedAt: String(parsed.decidedAt ?? '') };
  } catch {
    return null;
  }
}

export function saveConsent(choice: { analytics: boolean; marketing: boolean }): ConsentState {
  const state: ConsentState = { version: CONSENT_VERSION, ...choice, decidedAt: new Date().toISOString() };
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage blocked: consent just will not persist */ }
  if (!choice.analytics || !choice.marketing) removeOptionalCookies(choice);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: state }));
  return state;
}

export function hasConsent(category: ConsentCategory): boolean {
  if (category === 'essential') return true;
  const stored = getStoredConsent();
  return !!stored && stored[category];
}

export function onConsentChange(listener: (state: ConsentState | null) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<ConsentState>).detail ?? getStoredConsent());
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

// Known analytics / advertising cookie names, removed when consent is withdrawn.
const ANALYTICS_COOKIES = [/^_ga/, /^_gid$/, /^_gat/, /^_hj/, /^ajs_/, /^mp_/];
const MARKETING_COOKIES = [/^_fbp$/, /^_fbc$/, /^_gcl_/, /^IDE$/, /^fr$/, /^_ttp$/, /^_pin_/];

function expireCookie(name: string) {
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  domains.forEach(domain => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain ? `; domain=${domain}` : ''}`;
  });
}

export function removeOptionalCookies(choice: { analytics: boolean; marketing: boolean }) {
  try {
    document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean).forEach(name => {
      if (!choice.analytics && ANALYTICS_COOKIES.some(rx => rx.test(name))) expireCookie(name);
      if (!choice.marketing && MARKETING_COOKIES.some(rx => rx.test(name))) expireCookie(name);
    });
  } catch { /* cookies unavailable */ }
}

// Adds a <script> only when (and as soon as) the visitor has allowed that category.
// Safe to call many times: each src is added once.
const requested = new Set<string>();
export function loadScriptWithConsent(category: OptionalCategory, src: string, attributes: Record<string, string> = {}) {
  const inject = () => {
    if (document.querySelector(`script[data-consent-src="${src}"]`)) return;
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.dataset.consentSrc = src;
    Object.entries(attributes).forEach(([k, v]) => el.setAttribute(k, v));
    document.head.appendChild(el);
  };
  if (hasConsent(category)) { inject(); return; }
  if (requested.has(src)) return;
  requested.add(src);
  const off = onConsentChange(state => {
    if (state && state[category]) { inject(); off(); requested.delete(src); }
  });
}
