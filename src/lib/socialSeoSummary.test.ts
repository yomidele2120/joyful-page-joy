import { describe, expect, it } from 'vitest';
import { summarizeSocialSeo } from './socialSeoSummary';

describe('summarizeSocialSeo', () => {
  it('counts enabled marketing integrations and site settings', () => {
    const rows = [
      { enabled: true, provider: 'meta' },
      { enabled: true, provider: 'google' },
      { enabled: false, provider: 'tiktok' },
      { enabled: true, provider: 'instagram' },
      { seo_indexing_enabled: true, sitemap_enabled: true },
    ];

    const summary = summarizeSocialSeo(rows as any[]);

    expect(summary.enabled_integrations).toBe(3);
    expect(summary.total_integrations).toBe(4);
    expect(summary.google_enabled).toBe(true);
    expect(summary.seo_indexing_enabled).toBe(true);
    expect(summary.sitemap_enabled).toBe(true);
  });
});
