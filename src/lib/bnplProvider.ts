// Which Pay later partner is active. The admin chooses it under Finance > Settings; the database keeps the
// choice in finance_settings.bnpl_provider and hands it to shoppers through get_public_finance_settings().
export type BnplProvider = 'klump' | 'creditdirect';

export const BNPL_PROVIDERS: Record<BnplProvider, { name: string; blurb: string }> = {
  klump: { name: 'Klump', blurb: 'Klump opens its own window on this page.' },
  creditdirect: { name: 'Credit Direct', blurb: 'Buyers are sent to Credit Direct to apply, then come back here.' },
};

/** Anything unknown (or an older database without the column) falls back to Klump, the original provider. */
export function activeProvider(finance?: { bnpl_provider?: string | null } | null): BnplProvider {
  return finance?.bnpl_provider === 'creditdirect' ? 'creditdirect' : 'klump';
}

export function providerName(provider: string | null | undefined): string {
  return provider === 'creditdirect' ? BNPL_PROVIDERS.creditdirect.name : BNPL_PROVIDERS.klump.name;
}

/**
 * Can the BROWSER start this provider? Klump needs its public key on Vercel. Credit Direct needs nothing in the
 * browser (all its keys stay on the server, and the admin cannot switch to it until the server says they are set).
 */
export function providerBrowserReady(provider: BnplProvider, klumpPublicKey: string | undefined): boolean {
  return provider === 'creditdirect' ? true : !!klumpPublicKey;
}
