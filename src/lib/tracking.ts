// One place the shop calls when something happens. Each call is passed on to
//   1. our own analytics (src/lib/analytics.ts, shown in Admin > Traffic), and
//   2. the Meta Pixel (src/lib/metaPixel.ts), if a Pixel ID is configured.
//   3. the TikTok Pixel (loaded by public/tiktok-pixel.js, consent handled in src/lib/tiktokPixel.ts).
// Either one can be switched off without touching the pages that call this.

import * as meta from './metaPixel';
import * as own from './analytics';
import * as tiktok from './tiktokPixel';
import { hasConsent, onConsentChange } from './consent';
import { captureAttribution } from './attribution';

// Both kinds of tracking are optional cookies/storage, so nothing starts until the visitor allows it:
//   own analytics  -> "analytics" consent      Meta Pixel -> "marketing" consent
// Choices made later in the cookie banner switch them on or off straight away.
function syncWithConsent(): void {
  if (hasConsent('analytics')) own.initAnalytics(); else own.stopAnalytics();
  if (hasConsent('marketing')) { meta.initPixel(); tiktok.grantPixel(); } else { meta.stopPixel(); tiktok.stopPixel(); }
}

let listening = false;
export function initTracking(): void {
  captureAttribution();
  syncWithConsent();
  if (!listening) { listening = true; onConsentChange(syncWithConsent); }
}

export function trackPageView(pathname: string) { own.trackPageView(pathname); meta.trackPageView(pathname); tiktok.trackPageView(pathname); }
export function trackViewContent(p: Parameters<typeof meta.trackViewContent>[0]) { own.trackViewContent(p); meta.trackViewContent(p); tiktok.trackViewContent(p); }
export function trackSearch(term: string, resultCount?: number) { own.trackSearch(term, resultCount); meta.trackSearch(term); }
export function trackAddToCart(p: Parameters<typeof meta.trackAddToCart>[0]) { own.trackAddToCart(p); meta.trackAddToCart(p); tiktok.trackAddToCart(p); }
export function trackInitiateCheckout(lines: Parameters<typeof meta.trackInitiateCheckout>[0], value: number) { own.trackInitiateCheckout(lines, value); meta.trackInitiateCheckout(lines, value); tiktok.trackInitiateCheckout(lines, value); }
export function trackPurchase(orderId: string, lines: Parameters<typeof meta.trackPurchase>[1], value: number, preorder = false) { own.trackPurchase(orderId, lines, value); meta.trackPurchase(orderId, lines, value); tiktok.trackPurchase(orderId, lines, value, preorder); }
export function trackAddPaymentInfo(orderId: string, lines: Parameters<typeof meta.trackPurchase>[1], value: number) { tiktok.trackAddPaymentInfo(orderId, lines, value); }
export function trackRegistration(kind: 'buyer' | 'supplier') { own.trackRegistration(kind); meta.trackRegistration(kind); tiktok.trackRegistration(kind); }
export function trackLead(kind: 'inquiry' | 'rfq', productId?: string) { own.trackLead(kind, productId); meta.trackLead(kind, productId); }
