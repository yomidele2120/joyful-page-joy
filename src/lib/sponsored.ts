// Shared helpers for sponsored products: advertising links and report arithmetic.
// Rule: a figure that was not recorded is shown as "not entered" (null), never as 0 and never estimated.

export const CAMPAIGN_STATUSES = ['draft', 'pending_approval', 'approved', 'active', 'paused', 'completed', 'rejected'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft', pending_approval: 'Pending approval', approved: 'Approved', active: 'Active',
  paused: 'Paused', completed: 'Completed', rejected: 'Rejected',
};

/** What an admin may do next from each status. Anything else is refused in the screen. */
export const NEXT_STATUSES: Record<string, CampaignStatus[]> = {
  draft: ['pending_approval', 'rejected'],
  pending_approval: ['approved', 'rejected'],
  approved: ['active', 'paused', 'completed'],
  active: ['paused', 'completed'],
  paused: ['active', 'completed'],
  completed: [],
  rejected: ['draft'],
};

export const FUNDING_LABEL: Record<string, string> = { vendor: 'Vendor-funded', ithubafrica: 'ITHUBAFRICA-funded', shared: 'Shared' };

/** The product link to paste into TikTok Ads Manager. Tags identify source, campaign, vendor and product. */
export function buildLandingUrl(origin: string, p: { slug: string; productId: string; vendorId: string; campaignId: string; campaignCode: string }): string {
  const q = new URLSearchParams({
    utm_source: 'tiktok', utm_medium: 'paid', utm_campaign: p.campaignCode, utm_content: p.productId.slice(0, 8),
    ad_campaign: p.campaignId, ad_vendor: p.vendorId, ad_product: p.productId,
  });
  return `${origin.replace(/\/$/, '')}/product/${encodeURIComponent(p.slug)}?${q.toString()}`;
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const div = (a: number | null, b: number | null): number | null => (a === null || b === null || b <= 0 ? null : a / b);

export interface ReportRow {
  spend: number | string | null; impressions: number | string | null; clicks: number | string | null;
  product_views: number | string; add_to_carts: number | string; checkouts: number | string; purchases: number | string; revenue: number | string;
  tiktok_data_entered: boolean; allocated_budget?: number | string | null;
}

export interface Totals {
  tiktokEntered: boolean;
  spend: number | null; impressions: number | null; clicks: number | null;
  views: number; carts: number; checkouts: number; purchases: number; revenue: number; allocated: number;
  ctr: number | null; cpc: number | null; costPerPurchase: number | null; roas: number | null;
}

/** Adds rows up. TikTok figures are summed only over rows where they were entered; otherwise they stay null. */
export function totals(rows: ReportRow[]): Totals {
  const withData = rows.filter(r => r.tiktok_data_entered);
  const sum = (k: 'spend' | 'impressions' | 'clicks') => (withData.length ? withData.reduce((s, r) => s + Number(r[k] ?? 0), 0) : null);
  const spend = sum('spend'), impressions = sum('impressions'), clicks = sum('clicks');
  const add = (k: 'product_views' | 'add_to_carts' | 'checkouts' | 'purchases' | 'revenue') => rows.reduce((s, r) => s + Number(r[k] ?? 0), 0);
  const purchases = add('purchases'), revenue = add('revenue');
  return {
    tiktokEntered: withData.length > 0, spend, impressions, clicks,
    views: add('product_views'), carts: add('add_to_carts'), checkouts: add('checkouts'), purchases, revenue,
    allocated: rows.reduce((s, r) => s + Number(r.allocated_budget ?? 0), 0),
    ctr: div(clicks, impressions) === null ? null : (clicks! / impressions!) * 100,
    cpc: div(spend, clicks),
    costPerPurchase: spend !== null && purchases > 0 ? spend / purchases : null,
    roas: spend !== null && spend > 0 ? revenue / spend : null,
  };
}

export const remainingBudget = (allocated: number, spent: number | null): number | null => (spent === null ? null : allocated - spent);

export const naira = (v: number | null | undefined): string => (v === null || v === undefined ? 'Not entered' : `₦${Math.round(v).toLocaleString()}`);
export const count = (v: number | null | undefined): string => (v === null || v === undefined ? 'Not entered' : Math.round(v).toLocaleString());
export const percent = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : `${v.toFixed(2)}%`);
export const times = (v: number | null | undefined): string => (v === null || v === undefined ? 'n/a' : `${v.toFixed(2)}x`);

export { num };
