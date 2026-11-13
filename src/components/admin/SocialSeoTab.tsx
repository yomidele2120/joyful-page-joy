import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { summarizeSocialSeo } from '@/lib/socialSeoSummary';

type SocialIntegrationRow = {
  id: string;
  provider: string;
  enabled: boolean;
};

type SiteSeoRow = {
  id: boolean;
  seo_indexing_enabled: boolean;
  sitemap_enabled: boolean;
  merchant_feed_enabled: boolean;
  updated_at: string | null;
};

export default function SocialSeoTab() {
  const queryClient = useQueryClient();

  const { data: integrations = [] } = useQuery({
    queryKey: ['admin-social-integrations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vendor_social_accounts').select('id, provider, status').limit(20);
      if (error) throw error;
      return (data ?? []).map((row: { id: string; provider: string; status: string }) => ({
        id: row.id,
        provider: row.provider,
        enabled: row.status === 'connected',
      })) as SocialIntegrationRow[];
    },
  });

  const { data: seoSettings, isLoading: seoLoading } = useQuery({
    queryKey: ['admin-seo-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('site_seo_settings').select('*').maybeSingle();
      if (error) throw error;
      return (data ?? {
        id: true,
        seo_indexing_enabled: true,
        sitemap_enabled: true,
        merchant_feed_enabled: false,
        updated_at: null,
      }) as SiteSeoRow;
    },
  });

  const summary = useMemo(() => summarizeSocialSeo([
    ...integrations,
    ...(seoSettings ? [{ seo_indexing_enabled: seoSettings.seo_indexing_enabled, sitemap_enabled: seoSettings.sitemap_enabled, merchant_feed_enabled: seoSettings.merchant_feed_enabled }] : [])
  ]), [integrations, seoSettings]);

  const updateSeoSetting = async (field: 'seo_indexing_enabled' | 'sitemap_enabled' | 'merchant_feed_enabled', value: boolean) => {
    if (!seoSettings) return;
    const { error } = await supabase.from('site_seo_settings').upsert({ id: true, [field]: value, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('SEO setting saved');
    queryClient.invalidateQueries({ queryKey: ['admin-seo-settings'] });
  };

  if (seoLoading) return <p className="text-sm text-muted-foreground">Loading SEO and social settings...</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Connected" value={`${summary.enabled_integrations}/${summary.total_integrations}`} />
        <Stat label="Google" value={summary.google_enabled ? 'On' : 'Off'} />
        <Stat label="Meta" value={summary.meta_enabled ? 'On' : 'Off'} />
        <Stat label="TikTok" value={summary.tiktok_enabled ? 'On' : 'Off'} />
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="font-heading font-semibold">SEO and Google Merchant controls</h3>
        {seoSettings && (
          <div className="space-y-3">
            <ToggleRow label="Search indexing" description="Keep public product pages eligible for search indexing." checked={seoSettings.seo_indexing_enabled} onChange={v => updateSeoSetting('seo_indexing_enabled', v)} />
            <ToggleRow label="Sitemap generation" description="Allow the sitemap to include public products and categories." checked={seoSettings.sitemap_enabled} onChange={v => updateSeoSetting('sitemap_enabled', v)} />
            <ToggleRow label="Google Merchant feed" description="Expose a Google Merchant product feed for approved listings only." checked={seoSettings.merchant_feed_enabled} onChange={v => updateSeoSetting('merchant_feed_enabled', v)} />
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h3 className="font-heading font-semibold">Connected social channels</h3>
        {integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No social accounts are connected yet. Vendors can add them once the provider flow is approved.</p>
        ) : (
          <div className="space-y-2">
            {integrations.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded border border-border p-3 text-sm">
                <span className="font-medium capitalize">{item.provider}</span>
                <span className="rounded-full bg-secondary px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">{item.enabled ? 'connected' : 'not connected'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => Promise<void> }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
    </div>
  );
}
