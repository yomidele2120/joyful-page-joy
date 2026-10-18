import { beforeEach, describe, expect, it } from 'vitest';
import { CONSENT_VERSION, getStoredConsent, hasConsent, loadScriptWithConsent, saveConsent } from '@/lib/consent';

const clear = () => {
  window.localStorage.clear();
  document.head.querySelectorAll('script[data-consent-src]').forEach(el => el.remove());
  document.cookie.split(';').forEach(c => { document.cookie = `${c.split('=')[0].trim()}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; });
};

describe('cookie consent', () => {
  beforeEach(clear);

  it('keeps optional categories off until the visitor chooses', () => {
    expect(getStoredConsent()).toBeNull();
    expect(hasConsent('essential')).toBe(true);
    expect(hasConsent('analytics')).toBe(false);
    expect(hasConsent('marketing')).toBe(false);
  });

  it('remembers the choice per category', () => {
    saveConsent({ analytics: true, marketing: false });
    expect(hasConsent('analytics')).toBe(true);
    expect(hasConsent('marketing')).toBe(false);
    expect(getStoredConsent()?.version).toBe(CONSENT_VERSION);
  });

  it('asks again when the stored choice is from an older policy version', () => {
    window.localStorage.setItem('ithub.cookie-consent', JSON.stringify({ version: CONSENT_VERSION - 1, analytics: true, marketing: true, decidedAt: '' }));
    expect(getStoredConsent()).toBeNull();
    expect(hasConsent('analytics')).toBe(false);
  });

  it('ignores a corrupted record', () => {
    window.localStorage.setItem('ithub.cookie-consent', '{not json');
    expect(getStoredConsent()).toBeNull();
  });

  it('does not load an optional script before consent, then loads it once after', () => {
    const src = 'https://example.com/analytics.js';
    loadScriptWithConsent('analytics', src);
    expect(document.querySelector(`script[data-consent-src="${src}"]`)).toBeNull();
    saveConsent({ analytics: true, marketing: false });
    expect(document.querySelectorAll(`script[data-consent-src="${src}"]`)).toHaveLength(1);
    loadScriptWithConsent('analytics', src);
    expect(document.querySelectorAll(`script[data-consent-src="${src}"]`)).toHaveLength(1);
  });

  it('never loads an optional script when the visitor rejects', () => {
    const src = 'https://example.com/ads.js';
    loadScriptWithConsent('marketing', src);
    saveConsent({ analytics: false, marketing: false });
    expect(document.querySelector(`script[data-consent-src="${src}"]`)).toBeNull();
  });

  it('removes known analytics cookies when consent is withdrawn', () => {
    document.cookie = '_ga=GA1.1.123; path=/';
    expect(document.cookie).toContain('_ga=');
    saveConsent({ analytics: false, marketing: false });
    expect(document.cookie).not.toContain('_ga=');
  });
});
