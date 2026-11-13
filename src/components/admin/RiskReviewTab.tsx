import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { summarizeRiskFlags } from '@/lib/riskSummary';

type RiskFlagRow = {
  id: string;
  entity_type: string;
  reason: string;
  severity: string;
  status: string;
  created_at: string;
  evidence: Record<string, unknown> | null;
};

export default function RiskReviewTab() {
  const queryClient = useQueryClient();

  const { data: flags = [], isLoading } = useQuery({
    queryKey: ['admin-risk-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('risk_flags')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as RiskFlagRow[];
    },
  });

  const summary = useMemo(() => summarizeRiskFlags(flags), [flags]);

  const setStatus = async (id: string, status: 'reviewing' | 'resolved' | 'dismissed') => {
    const { error } = await supabase.from('risk_flags').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Risk flag marked as ${status}`);
    queryClient.invalidateQueries({ queryKey: ['admin-risk-flags'] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading risk review queue...</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Total" value={String(summary.total)} />
        <Stat label="Open" value={String(summary.open)} />
        <Stat label="Reviewing" value={String(summary.reviewing)} />
        <Stat label="Resolved" value={String(summary.resolved)} />
        <Stat label="Dismissed" value={String(summary.dismissed)} />
        <Stat label="High" value={String(summary.high)} />
        <Stat label="Critical" value={String(summary.critical)} />
        <Stat label="Medium" value={String(summary.medium)} />
      </div>

      <div className="space-y-3">
        {flags.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No risk flags yet. The queue stays empty until a suspicious order, payment, vendor or listing is scanned.
          </div>
        ) : (
          flags.map((flag) => (
            <div key={flag.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{flag.entity_type}</p>
                    <Badge variant="secondary">{flag.severity}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(flag.created_at).toLocaleString()}</p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {flag.status}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{flag.reason}</p>
              {flag.evidence && Object.keys(flag.evidence).length > 0 && (
                <pre className="mt-3 overflow-x-auto rounded bg-muted p-3 text-xs text-muted-foreground">
                  {JSON.stringify(flag.evidence, null, 2)}
                </pre>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setStatus(flag.id, 'reviewing')}>Reviewing</Button>
                <Button size="sm" variant="outline" onClick={() => setStatus(flag.id, 'resolved')}>Resolve</Button>
                <Button size="sm" variant="destructive" onClick={() => setStatus(flag.id, 'dismissed')}>Dismiss</Button>
              </div>
            </div>
          ))
        )}
      </div>
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
