import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Toast } from '@/components/ui/toast';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { summarizeCampaigns } from '@/lib/campaignSummary';

type CampaignRow = {
  id: string;
  title: string;
  placement: string;
  status: string;
  budget: number | string | null;
  spend: number | string | null;
  created_at: string;
};

export default function CampaignManagerTab() {
  const queryClient = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketplace_campaigns')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as CampaignRow[];
    },
  });

  const summary = useMemo(() => summarizeCampaigns(campaigns), [campaigns]);

  const updateStatus = async (id: string, status: 'approved' | 'paused' | 'rejected' | 'active' | 'ended') => {
    const { error } = await supabase.from('marketplace_campaigns').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Campaign updated to ${status}`);
    queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading campaigns...</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total" value={String(summary.total)} />
        <Stat label="Draft" value={String(summary.draft)} />
        <Stat label="Review" value={String(summary.pending_review)} />
        <Stat label="Approved" value={String(summary.approved)} />
        <Stat label="Active" value={String(summary.active)} />
        <Stat label="Paused" value={String(summary.paused)} />
        <Stat label="Rejected" value={String(summary.rejected)} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Stat label="Budget" value={`NGN ${Number(summary.total_budget).toLocaleString('en-NG')}`} />
        <Stat label="Spend" value={`NGN ${Number(summary.total_spend).toLocaleString('en-NG')}`} />
      </div>

      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No campaigns yet. Vendors can create them once they begin sponsored placements for products.
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{campaign.title}</p>
                  <p className="text-xs text-muted-foreground">{campaign.placement} • {new Date(campaign.created_at).toLocaleDateString()}</p>
                </div>
                <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {campaign.status}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                <span>Budget: NGN {Number(campaign.budget ?? 0).toLocaleString('en-NG')}</span>
                <span>Spend: NGN {Number(campaign.spend ?? 0).toLocaleString('en-NG')}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => updateStatus(campaign.id, 'approved')}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => updateStatus(campaign.id, 'paused')}>Pause</Button>
                <Button size="sm" variant="outline" onClick={() => updateStatus(campaign.id, 'active')}>Activate</Button>
                <Button size="sm" variant="destructive" onClick={() => updateStatus(campaign.id, 'rejected')}>Reject</Button>
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
