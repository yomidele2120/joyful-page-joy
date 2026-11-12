import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Save, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { merchantCenterRequest } from '@/lib/googleMerchantCenter';

type Settings = {
  merchant_account_id: string | null;
  data_source_id: string | null;
  feed_label: string;
  content_language: string;
  currency_code: string;
  enabled: boolean;
};

type ProductStatus = {
  product_id: string;
  product_title: string;
  sync_status: string;
  approval_status: string;
  issues: Array<{ code?: string; description?: string; detail?: string; severity?: string }>;
  last_error: string | null;
  status_error: string | null;
  last_synced_at: string | null;
};

type Dashboard = {
  settings: Settings;
  credentialsConfigured: boolean;
  cronConfigured: boolean;
  bulkSyncPaused: boolean;
  initialBatchReady: boolean;
  pendingJobs: number;
  summary: {
    totalEligible: number;
    successfullySubmitted: number;
    pendingSynchronization: number;
    failedSubmissions: number;
    awaitingGoogleProcessing: number;
    disapproved: number;
    lastSynchronizationAt: string | null;
  };
  products: ProductStatus[];
  history: Array<{ id: number; product_title: string; operation: string; result: string; message: string | null; created_at: string }>;
};

const panel = 'rounded-xl border border-border bg-card p-5';
const initialSettings: Settings = {
  merchant_account_id: '',
  data_source_id: '',
  feed_label: 'NG',
  content_language: 'en',
  currency_code: 'NGN',
  enabled: false,
};

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'Not synchronized yet';
}

function statusStyle(status: string): 'default' | 'destructive' | 'secondary' {
  if (status === 'approved' || status === 'submitted' || status === 'deleted') return 'default';
  if (status === 'disapproved' || status === 'failed' || status === 'ineligible') return 'destructive';
  return 'secondary';
}

export default function GoogleMerchantCenterTab() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const settingsInitialized = useRef(false);
  const { data, error, isLoading } = useQuery({
    queryKey: ['merchant-center-admin'],
    queryFn: () => merchantCenterRequest<Dashboard>(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (data?.settings && !settingsInitialized.current) {
      settingsInitialized.current = true;
      setSettings(data.settings);
    }
  }, [data?.settings]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['merchant-center-admin'] });
  const save = useMutation({
    mutationFn: () => merchantCenterRequest('save_settings', { settings }),
    onSuccess: () => { toast.success('Merchant Center settings saved.'); void refresh(); },
    onError: (cause: Error) => toast.error(cause.message),
  });
  const action = useMutation({
    mutationFn: ({ name, payload }: { name: string; payload?: Record<string, unknown> }) => merchantCenterRequest(name, payload),
    onSuccess: (result, variables) => {
      if (variables.name === 'sync_all' && result.initialBatchReady !== true) {
        toast.error('The first batch was incomplete or had submission failures. Review product errors and retry before continuing.');
        void refresh();
        return;
      }
      const messages: Record<string, string> = {
        verify_connection: 'Merchant Center account and API data source verified.',
        sync_all: 'The first product batch has been submitted. Review its status before continuing.',
        continue_catalogue: 'The remaining catalogue has been released for synchronization.',
        sync_product: 'Product synchronization request completed.',
        retry_failed: 'Failed products have been re-queued.',
        refresh_status: 'Product approval statuses refreshed.',
      };
      toast.success(messages[variables.name] || 'Merchant Center action completed.');
      void refresh();
    },
    onError: (cause: Error) => toast.error(cause.message),
  });

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading Merchant Center…</div>;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <span>{(error as Error).message}</span>
        </div>
      )}

      <section className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Google Merchant Center</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Configure the Merchant API account and primary API data source. Service-account credentials stay in Vercel server environment variables and are never sent to this page.
            </p>
          </div>
          <Badge variant={data?.settings.enabled ? 'default' : 'secondary'}>{data?.settings.enabled ? 'Sync enabled' : 'Sync disabled'}</Badge>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="merchant-account">Merchant Center account ID</Label>
            <Input id="merchant-account" inputMode="numeric" value={settings.merchant_account_id ?? ''} onChange={(event) => setSettings({ ...settings, merchant_account_id: event.target.value })} placeholder="123456789" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant-data-source">Primary API data source</Label>
            <Input id="merchant-data-source" value={settings.data_source_id ?? ''} onChange={(event) => setSettings({ ...settings, data_source_id: event.target.value })} placeholder="accounts/123456789/dataSources/987654321" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant-feed-label">Feed label / target</Label>
            <Input id="merchant-feed-label" maxLength={20} value={settings.feed_label} onChange={(event) => setSettings({ ...settings, feed_label: event.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant-language">Content language</Label>
            <Input id="merchant-language" maxLength={2} value={settings.content_language} onChange={(event) => setSettings({ ...settings, content_language: event.target.value.toLowerCase() })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="merchant-currency">Price currency</Label>
            <Input id="merchant-currency" maxLength={3} value={settings.currency_code} onChange={(event) => setSettings({ ...settings, currency_code: event.target.value.toUpperCase() })} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <Switch id="merchant-enabled" checked={settings.enabled} onCheckedChange={(enabled) => setSettings({ ...settings, enabled })} />
            <Label htmlFor="merchant-enabled">Enable automatic product synchronization</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate({ name: 'verify_connection', payload: { settings } })}>
              {action.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Test connection
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save settings
            </Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 border-t border-border pt-4 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Server service-account credentials</span>
            <Badge variant={data?.credentialsConfigured ? 'default' : 'destructive'}>{data?.credentialsConfigured ? 'Configured' : 'Missing'}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Scheduled worker secret</span>
            <Badge variant={data?.cronConfigured ? 'default' : 'destructive'}>{data?.cronConfigured ? 'Configured' : 'Missing'}</Badge>
          </div>
        </div>
      </section>

      <section className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Catalogue synchronization</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {data?.pendingJobs ?? 0} queued. Product changes and seller approval changes are queued automatically; the Vercel scheduled worker retries transient failures.
              {data?.bulkSyncPaused && !data.initialBatchReady && ' Bulk synchronization is paused; review errors and retry the first batch.'}
              {data?.bulkSyncPaused && data.initialBatchReady && ' The first batch was accepted by the Merchant API; review the results before continuing.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={action.isPending || !settings.enabled} onClick={() => action.mutate({ name: 'refresh_status' })}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh approvals
            </Button>
            <Button variant="outline" disabled={action.isPending || !settings.enabled} onClick={() => action.mutate({ name: 'retry_failed' })}>
              Retry failed
            </Button>
            <Button
              disabled={action.isPending || !settings.enabled}
              onClick={() => action.mutate({ name: data?.initialBatchReady ? 'continue_catalogue' : 'sync_all' })}
            >
              <Send className="mr-2 h-4 w-4" />{data?.initialBatchReady ? 'Continue catalogue sync' : data?.bulkSyncPaused ? 'Retry first batch' : 'Sync first 10 products'}
            </Button>
          </div>
        </div>
      </section>

      <section className={`${panel} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        {[
          ['Eligible products', data?.summary.totalEligible],
          ['Successfully submitted', data?.summary.successfullySubmitted],
          ['Pending synchronization', data?.summary.pendingSynchronization],
          ['Failed submissions', data?.summary.failedSubmissions],
          ['Awaiting Google processing', data?.summary.awaitingGoogleProcessing],
          ['Rejected / disapproved', data?.summary.disapproved],
        ].map(([label, count]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{count ?? '—'}</p>
          </div>
        ))}
        <div className="sm:col-span-2 lg:col-span-4">
          <p className="text-sm text-muted-foreground">Last synchronization</p>
          <p className="mt-1 text-sm">{dateLabel(data?.summary.lastSynchronizationAt ?? null)}</p>
        </div>
      </section>

      <section className={panel}>
        <h2 className="font-heading text-lg font-bold">Product approval and sync status</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Sync</th>
                <th className="py-2 pr-3 font-medium">Google approval</th>
                <th className="py-2 pr-3 font-medium">Last sync</th>
                <th className="py-2 font-medium">Action / issue</th>
              </tr>
            </thead>
            <tbody>
              {(data?.products ?? []).map((product) => (
                <tr key={product.product_id} className="border-b border-border/70 align-top">
                  <td className="py-3 pr-3">
                    <p className="font-medium">{product.product_title}</p>
                    <p className="font-mono text-xs text-muted-foreground">{product.product_id}</p>
                  </td>
                  <td className="py-3 pr-3"><Badge variant={statusStyle(product.sync_status)}>{product.sync_status}</Badge></td>
                  <td className="py-3 pr-3"><Badge variant={statusStyle(product.approval_status)}>{product.approval_status}</Badge></td>
                  <td className="py-3 pr-3 whitespace-nowrap">{dateLabel(product.last_synced_at)}</td>
                  <td className="max-w-sm py-3 text-xs text-muted-foreground">
                    {product.last_error || product.status_error || product.issues?.map((issue) => issue.description || issue.detail || issue.code).filter(Boolean).join('; ') || '—'}
                    <Button
                      className="mt-2"
                      variant="outline"
                      size="sm"
                      disabled={action.isPending || !settings.enabled}
                      onClick={() => action.mutate({ name: 'sync_product', payload: { productId: product.product_id } })}
                    >
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />Sync product
                    </Button>
                  </td>
                </tr>
              ))}
              {!data?.products.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No products have been synchronized.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={panel}>
        <h2 className="font-heading text-lg font-bold">Synchronization history</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Product</th>
                <th className="py-2 pr-3 font-medium">Operation</th>
                <th className="py-2 pr-3 font-medium">Result</th>
                <th className="py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {(data?.history ?? []).map((entry) => (
                <tr key={entry.id} className="border-b border-border/70">
                  <td className="py-2 pr-3 whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-3">{entry.product_title}</td>
                  <td className="py-2 pr-3">{entry.operation}</td>
                  <td className="py-2 pr-3"><Badge variant={statusStyle(entry.result)}>{entry.result}</Badge></td>
                  <td className="max-w-sm py-2 text-xs text-muted-foreground">{entry.message || '—'}</td>
                </tr>
              ))}
              {!data?.history.length && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No synchronization attempts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
