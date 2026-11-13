import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { Panel } from '@/components/dashboard/DashboardShell';

type EmailJob = {
  id: string;
  event_key: string;
  event_type: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  status: 'pending' | 'sending' | 'sent' | 'delivery_delayed' | 'delivered' | 'bounced' | 'complained' | 'failed';
  attempts: number;
  max_attempts: number;
  resend_id: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

const statusVariant: Record<EmailJob['status'], 'secondary' | 'outline' | 'default' | 'destructive'> = {
  pending: 'secondary', sending: 'outline', sent: 'secondary', delivery_delayed: 'outline',
  delivered: 'default', bounced: 'destructive', complained: 'destructive', failed: 'destructive',
};

export default function EmailNotificationsTab() {
  const queryClient = useQueryClient();
  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ['admin-email-notifications'],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_notification_jobs')
        .select('id,event_key,event_type,recipient_user_id,recipient_email,status,attempts,max_attempts,resend_id,last_error,created_at,sent_at')
        .order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data as EmailJob[];
    },
    refetchInterval: 30_000,
  });
  const { data: settings, isError: settingsError } = useQuery({
    queryKey: ['admin-email-delivery-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('email_delivery_settings')
        .select('notify_admin_new_buyers').eq('id', true).single();
      if (error) throw error;
      return data;
    },
  });
  const saveBuyerSetting = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase.from('email_delivery_settings')
        .update({ notify_admin_new_buyers: enabled, updated_at: new Date().toISOString() }).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Email alert setting saved');
      queryClient.invalidateQueries({ queryKey: ['admin-email-delivery-settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <Panel title="Email notification settings">
        {settingsError ? <p className="text-sm text-destructive">Could not load email settings. Apply 20261112110000_email_notification_outbox.sql.</p> : (
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="admin-new-buyer-email" className="font-medium">Email administrators about new buyer accounts</Label>
              <p className="mt-1 text-xs text-muted-foreground">Disabled by default. Vendor registrations are reported separately.</p>
            </div>
            <Switch id="admin-new-buyer-email" checked={settings?.notify_admin_new_buyers ?? false}
              disabled={!settings || saveBuyerSetting.isPending} onCheckedChange={value => saveBuyerSetting.mutate(value)} />
          </div>
        )}
      </Panel>

      <Panel title={`Recent email deliveries (${jobs.length})`}>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading email deliveries...</p>
          : isError ? <p className="text-sm text-destructive">Could not load delivery history.</p>
            : jobs.length === 0 ? <p className="text-sm text-muted-foreground">No email notifications have been queued yet.</p>
              : <>
                <p className="mb-2 text-xs text-muted-foreground">“Sent” means Resend accepted the request. “Delivered” means the recipient’s mail server accepted the message.</p>
                <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead><tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Event</th><th className="py-2 pr-3 font-medium">Recipient</th>
                    <th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Attempts</th>
                    <th className="py-2 pr-3 font-medium">Created</th><th className="py-2 pr-3 font-medium">Sent</th>
                    <th className="py-2 font-medium">Resend ID / error</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {jobs.map(job => <tr key={job.id}>
                      <td className="py-3 pr-3 font-medium">{job.event_type}</td>
                      <td className="max-w-[200px] truncate py-3 pr-3" title={job.recipient_email ?? job.recipient_user_id ?? 'Unresolved'}>{job.recipient_email ?? job.recipient_user_id ?? 'Unresolved'}</td>
                      <td className="py-3 pr-3"><Badge variant={statusVariant[job.status]}>{job.status}</Badge></td>
                      <td className="py-3 pr-3 tabular-nums">{job.attempts}/{job.max_attempts}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs">{new Date(job.created_at).toLocaleString()}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-xs">{job.sent_at ? new Date(job.sent_at).toLocaleString() : '—'}</td>
                      <td className="max-w-[220px] truncate py-3 text-xs text-muted-foreground" title={job.last_error ?? job.resend_id ?? job.event_key}>{job.last_error ?? job.resend_id ?? job.event_key}</td>
                    </tr>)}
                  </tbody>
                </table>
                </div>
              </>}
      </Panel>
    </div>
  );
}
