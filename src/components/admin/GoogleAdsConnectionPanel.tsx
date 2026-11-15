import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';

interface Step { step: string; ok: boolean; detail?: any }
interface Result { ok: boolean; steps?: Step[]; missing?: string[]; error?: string }

const LABEL: Record<string, string> = {
  secrets: 'Secrets found',
  sign_in: 'Google accepted the sign-in',
  accessible_accounts: 'Accounts this sign-in can reach',
  manager_account: 'Manager account',
  failed: 'Failed',
};

// Calls the admin-only google-ads-check edge function. It changes nothing in Google Ads and never returns a secret.
export default function GoogleAdsConnectionPanel() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const test = async () => {
    setBusy(true); setProblem(null); setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('google-ads-check', { body: {} });
      if (error) {
        setProblem(/not found|404|Failed to send/i.test(error.message)
          ? 'The google-ads-check function is not reachable. Deploy it in Supabase (Edge Functions) and try again.'
          : error.message);
      } else setResult(data as Result);
    } catch (e: any) { setProblem(e?.message ?? 'Could not reach the function.'); }
    finally { setBusy(false); }
  };

  const failed = result?.steps?.find((s) => s.step === 'failed');
  return (
    <Panel title="Google Ads connection">
      <p className="text-sm text-muted-foreground mb-3">
        Checks the five Google Ads secrets saved in Supabase and asks Google whether they work. It changes nothing in your Google Ads account.
      </p>
      <Button onClick={test} disabled={busy}>{busy ? 'Testing…' : 'Test connection'}</Button>

      {problem && <p className="mt-3 text-sm text-destructive">{problem}</p>}

      {result && (
        <div className="mt-4 text-sm space-y-2">
          <p className={result.ok ? 'font-medium text-green-700' : 'font-medium text-destructive'}>
            {result.ok ? 'Connected. Google accepted your keys.' : 'Not connected.'}
          </p>
          {result.missing?.length ? <p>Missing or invalid secrets: <span className="font-mono">{result.missing.join(', ')}</span></p> : null}
          {result.error && !result.missing?.length ? <p>{result.error}</p> : null}
          <ul className="space-y-1">
            {(result.steps ?? []).map((s) => (
              <li key={s.step}>
                <span className={s.ok ? 'text-green-700' : 'text-destructive'}>{s.ok ? '✓' : '✗'}</span> {LABEL[s.step] ?? s.step}
                {s.step === 'accessible_accounts' && s.detail ? ` (${s.detail.count} found${s.detail.includesManager ? '' : ', your login customer ID is not among them'})` : ''}
                {s.step === 'manager_account' && s.detail ? `: ${s.detail.name ?? s.detail.id}${s.detail.isTestAccount ? ' (test account)' : ''}${s.detail.isManager ? '' : ', not a manager account'}` : ''}
                {s.step === 'secrets' && s.detail?.apiVersion ? ` (API ${s.detail.apiVersion})` : ''}
              </li>
            ))}
          </ul>
          {failed?.detail && <p className="text-destructive">{String(failed.detail.message)} <span className="font-mono">({String(failed.detail.code)})</span></p>}
        </div>
      )}
    </Panel>
  );
}
