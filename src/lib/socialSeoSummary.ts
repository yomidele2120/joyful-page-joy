export type SocialSeoSummary = {
  total_integrations: number;
  enabled_integrations: number;
  google_enabled: boolean;
  meta_enabled: boolean;
  tiktok_enabled: boolean;
  instagram_enabled: boolean;
  seo_indexing_enabled: boolean;
  sitemap_enabled: boolean;
  merchant_feed_enabled: boolean;
};

export function summarizeSocialSeo(rows: Array<{ enabled?: boolean | null; provider?: string | null; seo_indexing_enabled?: boolean | null; sitemap_enabled?: boolean | null; merchant_feed_enabled?: boolean | null }>): SocialSeoSummary {
  const integrations = rows.filter((item): item is { enabled?: boolean | null; provider: string } => Boolean(item) && typeof item.provider === 'string' && item.provider.trim().length > 0);
  const seoSettings = rows.find((item) => item && (item.seo_indexing_enabled !== undefined || item.sitemap_enabled !== undefined || item.merchant_feed_enabled !== undefined));
  const enabledIntegrations = integrations.filter(item => item.enabled === true).length;
  const summary: SocialSeoSummary = {
    total_integrations: integrations.length,
    enabled_integrations: enabledIntegrations,
    google_enabled: integrations.some(item => item.provider === 'google' && item.enabled === true),
    meta_enabled: integrations.some(item => item.provider === 'meta' && item.enabled === true),
    tiktok_enabled: integrations.some(item => item.provider === 'tiktok' && item.enabled === true),
    instagram_enabled: integrations.some(item => item.provider === 'instagram' && item.enabled === true),
    seo_indexing_enabled: Boolean(seoSettings?.seo_indexing_enabled),
    sitemap_enabled: Boolean(seoSettings?.sitemap_enabled),
    merchant_feed_enabled: Boolean(seoSettings?.merchant_feed_enabled),
  };

  return summary;
}
