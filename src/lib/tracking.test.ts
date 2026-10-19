import { beforeEach, describe, expect, it, vi } from 'vitest';

const consent = { analytics: false, marketing: false };
let listener: (() => void) | undefined;

vi.mock('./consent', () => ({
  hasConsent: (c: 'analytics' | 'marketing') => consent[c],
  onConsentChange: (fn: () => void) => { listener = fn; return () => undefined; },
}));
vi.mock('./analytics', () => ({
  initAnalytics: vi.fn(), stopAnalytics: vi.fn(), trackPageView: vi.fn(), trackViewContent: vi.fn(), trackSearch: vi.fn(),
  trackAddToCart: vi.fn(), trackInitiateCheckout: vi.fn(), trackPurchase: vi.fn(), trackRegistration: vi.fn(), trackLead: vi.fn(),
}));
vi.mock('./metaPixel', () => ({
  initPixel: vi.fn(), stopPixel: vi.fn(), trackPageView: vi.fn(), trackViewContent: vi.fn(), trackSearch: vi.fn(),
  trackAddToCart: vi.fn(), trackInitiateCheckout: vi.fn(), trackPurchase: vi.fn(), trackRegistration: vi.fn(), trackLead: vi.fn(),
}));

import * as own from './analytics';
import * as meta from './metaPixel';
import { initTracking } from './tracking';

describe('tracking respects the cookie choice', () => {
  beforeEach(() => { vi.clearAllMocks(); consent.analytics = false; consent.marketing = false; });

  it('starts nothing before the visitor allows it', () => {
    initTracking();
    expect(own.initAnalytics).not.toHaveBeenCalled();
    expect(meta.initPixel).not.toHaveBeenCalled();
  });

  it('starts analytics and the pixel only for the categories that were allowed, as soon as they are', () => {
    initTracking();
    consent.analytics = true;
    listener?.();
    expect(own.initAnalytics).toHaveBeenCalledTimes(1);
    expect(meta.initPixel).not.toHaveBeenCalled();
    consent.marketing = true;
    listener?.();
    expect(meta.initPixel).toHaveBeenCalledTimes(1);
  });

  it('stops both when consent is withdrawn', () => {
    consent.analytics = true; consent.marketing = true;
    initTracking();
    consent.analytics = false; consent.marketing = false;
    listener?.();
    expect(own.stopAnalytics).toHaveBeenCalled();
    expect(meta.stopPixel).toHaveBeenCalled();
  });
});
