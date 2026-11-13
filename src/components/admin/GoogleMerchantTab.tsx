import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

type MerchantSettings = {
  merchant_id: string | null;
  data_source_id: string | null;
  account_email: string | null;
  website_url: string | null;
  target_country: string;
  language: string;
  auto_sync: boolean;
  is_connected: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

type MerchantProduct = {
  id: string;
  product_id: string;
  merchant_product_id: string | null;
  title: string;
  status: string;
  approval_status: string;
  rejection_reasons: Array<{ message?: string } | string> | null;
  last_sync_at: string | null;
  last_error: string | null;
};

type SyncLog = {
  id: number;
  action: string;
  status: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type MerchantStats = {
  total_eligible: number;
  submitted_successfully: number;
  pending_sync: number;
  failed_submissions: number;
  awaiting_google_processing: number;
  rejected_or_disapproved: number;
};

type CatalogueProduct = {
  id: string;
  name: string;
  price: number;
};

export default function GoogleMerchantTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    merchant_id: '',
    data_source_id: '',
    account_email: '',
    website_url: 'https://www.ithubafrica.com',
    target_country: 'NG',
    language: 'en',
    auto_sync: true,
  });
  const [syncingCatalog, setSyncingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingProductId, setSyncingProductId] = useState<string | null>(null);

  const { data: status, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['google-merchant-status'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('google-merchant', { body: { action: 'status' } });
      if (error) throw error;
      return data as {
        settings: MerchantSettings;
        stats: MerchantStats;
        products: MerchantProduct[];
        catalogue: CatalogueProduct[];
        logs: SyncLog[];
      };
    },
  });

  const settings = status?.settings;
  const statCards = [
    { label: 'Total eligible products', value: status?.stats.total_eligible },
    { label: 'Submitted successfully', value: status?.stats.submitted_successfully },
    { label: 'Pending synchronization', value: status?.stats.pending_sync },
    { label: 'Failed submissions', value: status?.stats.failed_submissions },
    { label: 'Awaiting Google processing', value: status?.stats.awaiting_google_processing },
    { label: 'Rejected / disapproved', value: status?.stats.rejected_or_disapproved },
  ];

  useEffect(() => {
    if (!settings) return;
    setForm({
      merchant_id: settings.merchant_id || '',
      data_source_id: settings.data_source_id || '',
      account_email: settings.account_email || '',
      website_url: settings.website_url || 'https://www.ithubafrica.com',
      target_country: settings.target_country || 'NG',
      language: settings.language || 'en',
      auto_sync: settings.auto_sync,
    });
  }, [settings]);

  const saveConfig = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-merchant', {
        body: {
          action: 'save_config',
          merchant_id: form.merchant_id,
          data_source_id: form.data_source_id,
          account_email: form.account_email,
          website_url: form.website_url,
          target_country: form.target_country,
          language: form.language,
          auto_sync: form.auto_sync,
        },
      });
      if (error) throw error;
      toast.success(`Merchant account and existing data source verified: ${data.merchant_id} / ${data.data_source_id}`);
      queryClient.invalidateQueries({ queryKey: ['google-merchant-status'] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not connect the Google Merchant account.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const syncCatalog = async () => {
    setSyncingCatalog(true);
    try {
      let totalSynced = 0;
      let totalRemoved = 0;
      let totalFailed = 0;
      let remaining = 1;
      let batches = 0;
      while (remaining > 0 && batches < 1000) {
        const { data, error } = await supabase.functions.invoke('google-merchant', { body: { action: 'sync_catalog' } });
        if (error) throw error;
        totalSynced += Number(data.synced ?? 0);
        totalRemoved += Number(data.removed ?? 0);
        totalFailed += Number(data.failed ?? 0);
        remaining = Number(data.remaining ?? 0);
        batches += 1;
        if (totalFailed > 0 || data.stalled || (Number(data.processed ?? 0) === 0 && remaining > 0)) break;
      }
      if (batches >= 1000 && remaining > 0) throw new Error('Synchronization stopped after 1,000 batches. Run it again to continue.');
      if (totalFailed > 0) {
        toast.error(`Stopped after the first failed batch: ${totalSynced} accepted, ${totalFailed} failed. Review the error log before continuing.`);
      } else if (remaining > 0) {
        toast.message(`${totalSynced} submission(s) accepted; ${totalRemoved} listing(s) removed; ${remaining} item(s) are waiting for retry.`);
      } else {
        toast.success(`Google accepted ${totalSynced} submission(s); ${totalRemoved} listing(s) removed.`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not synchronize the catalog.';
      toast.error(message);
    } finally {
      setSyncingCatalog(false);
      queryClient.invalidateQueries({ queryKey: ['google-merchant-status'] });
    }
  };

  const syncProduct = async (productId: string) => {
    setSyncingProductId(productId);
    try {
      const { data, error } = await supabase.functions.invoke('google-merchant', { body: { action: 'sync_product', product_id: productId } });
      if (error) throw error;
      toast.success(data.message || 'Product synced.');
      queryClient.invalidateQueries({ queryKey: ['google-merchant-status'] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not sync the selected product.';
      toast.error(message);
    } finally {
      setSyncingProductId(null);
    }
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading Merchant Center status...</div>;
  }
  if (isError) {
    return (
      <div role="alert" className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
        <p>{error instanceof Error ? error.message : 'Could not load Google Merchant Center status.'}</p>
        <Button variant="outline" onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Google Merchant Center</h3>
            <p className="text-sm text-muted-foreground">Secure server-side product submissions for eligible marketplace listings.</p>
          </div>
          <Badge variant={settings?.is_connected ? 'default' : 'secondary'}>{settings?.is_connected ? 'Connected' : 'Not connected'}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="merchant-id">Merchant Center ID</Label>
              <Input id="merchant-id" value={form.merchant_id || settings?.merchant_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, merchant_id: e.target.value }))} placeholder="1234567890" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="merchant-data-source">Existing Merchant API data source ID</Label>
              <Input id="merchant-data-source" value={form.data_source_id || settings?.data_source_id || ''} onChange={(e) => setForm((prev) => ({ ...prev, data_source_id: e.target.value }))} placeholder="1234567890" />
              <p className="text-xs text-muted-foreground">Use the ID of the existing API data source. This integration will not create another data source.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-email">Account email</Label>
              <Input id="merchant-email" value={form.account_email || settings?.account_email || ''} onChange={(e) => setForm((prev) => ({ ...prev, account_email: e.target.value }))} placeholder="merchant@yourdomain.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-url">Website URL</Label>
              <Input id="merchant-url" value={form.website_url || settings?.website_url || 'https://www.ithubafrica.com'} onChange={(e) => setForm((prev) => ({ ...prev, website_url: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-country">Target country</Label>
              <Input id="merchant-country" value={form.target_country || settings?.target_country || 'NG'} onChange={(e) => setForm((prev) => ({ ...prev, target_country: e.target.value.toUpperCase() }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="merchant-language">Language</Label>
              <Input id="merchant-language" value={form.language || settings?.language || 'en'} onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded border border-border p-3">
            <div>
              <p className="text-sm font-medium">Automatic catalog sync</p>
              <p className="text-xs text-muted-foreground">Keep eligible products synced with Google when the server-side job runs.</p>
            </div>
            <Switch checked={settings ? form.auto_sync : true} onCheckedChange={(value) => setForm((prev) => ({ ...prev, auto_sync: value }))} />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={saveConfig} disabled={saving}>
              {saving ? 'Connecting...' : 'Save configuration'}
            </Button>
            <Button variant="outline" onClick={syncCatalog} disabled={syncingCatalog || !settings?.merchant_id || !settings?.data_source_id}>
              {syncingCatalog ? 'Syncing...' : 'Synchronize eligible catalogue'}
            </Button>
          </div>

          {settings?.last_error && (
            <div className="rounded border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
              {settings.last_error}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h4 className="font-semibold">Status</h4>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Merchant ID</dt><dd>{settings?.merchant_id || 'Not set'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Data source ID</dt><dd>{settings?.data_source_id || 'Not set'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Connected</dt><dd>{settings?.is_connected ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Auto sync</dt><dd>{settings?.auto_sync ? 'On' : 'Off'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Last sync</dt><dd>{settings?.last_synced_at ? new Date(settings.last_synced_at).toLocaleString() : 'Never'}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {statCards.map(({ label, value }) => (
          <div key={label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{Number(value ?? 0).toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-1 font-semibold">Eligible products</h4>
          <p className="mb-3 text-xs text-muted-foreground">A successful API submission is not the same as Google approval.</p>
          <div className="space-y-2">
            {(status?.catalogue ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No eligible products found.</p>
            ) : (
              (status?.catalogue ?? []).slice(0, 10).map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 rounded border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{Number(row.price).toLocaleString(undefined, { style: 'currency', currency: 'NGN' })}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={syncingProductId === row.id} onClick={() => syncProduct(row.id)}>
                      {syncingProductId === row.id ? 'Syncing...' : 'Sync'}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 font-semibold">Recent submissions</h4>
          <div className="space-y-2">
            {(status?.products ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No Merchant API submissions yet.</p>
            ) : (
              status?.products.slice(0, 10).map((row) => (
                <div key={row.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{row.title}</p>
                    <Badge variant={row.status === 'failed' ? 'destructive' : 'secondary'}>{row.approval_status || row.status}</Badge>
                  </div>
                  {row.last_error && <p className="mt-1 text-xs text-destructive">{row.last_error}</p>}
                  {Array.isArray(row.rejection_reasons) && row.rejection_reasons.map((reason, index) => (
                    <p key={index} className="mt-1 text-xs text-destructive">{typeof reason === 'string' ? reason : reason.message}</p>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h4 className="mb-3 font-semibold">Synchronization history</h4>
          <div className="space-y-2">
            {(status?.logs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No sync activity yet.</p>
            ) : (
              (status?.logs ?? []).slice(0, 10).map((log) => (
                <div key={log.id} className="rounded border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium">{log.action}</p>
                    <Badge variant={log.status === 'error' ? 'destructive' : 'secondary'}>{log.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{log.message}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
