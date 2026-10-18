import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

const STATUS: Record<string, string> = { open: 'Needs your response', seller_responded: 'You responded', under_review: 'Under review', resolved: 'Resolved', closed: 'Closed' };
const REASONS: Record<string, string> = {
  not_received: 'Order not received', not_as_described: 'Not as described', damaged: 'Arrived damaged',
  late_preorder: 'Preorder is very late', refund_not_received: 'Refund not received', other: 'Other',
};
const OUTCOMES: Record<string, string> = { refund: 'a refund', replacement: 'a replacement', other: 'another outcome' };

// Disputes buyers opened against this store. Sellers can only reply; the marketplace decides.
export default function SellerDisputes({ vendorId }: { vendorId: string }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['vendor-disputes', vendorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('disputes').select('*').eq('vendor_id', vendorId).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const respond = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase.from('disputes').update({ seller_response: text }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Your response was sent'); queryClient.invalidateQueries({ queryKey: ['vendor-disputes'] }); },
    onError: (err: Error) => toast.error(err.message || 'Could not send your response'),
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  if (!data?.length) return <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No disputes. Keeping buyers informed in Messages helps avoid them.</div>;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Respond promptly and honestly. We review both sides and decide; see the <Link to="/dispute-resolution" className="text-primary hover:underline">Dispute Resolution Policy</Link>.</p>
      {data.map(d => {
        const closed = ['resolved', 'closed'].includes(d.status);
        const text = drafts[d.id] ?? d.seller_response ?? '';
        return (
          <article key={d.id} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-heading font-semibold">Order #{d.order_id.slice(0, 8).toUpperCase()} - {REASONS[d.reason] ?? d.reason}</p>
              <Badge variant="secondary">{STATUS[d.status] ?? d.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString()} - the buyer wants {OUTCOMES[d.desired_outcome] ?? d.desired_outcome}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm">{d.details}</p>
            {d.resolution && <p className="mt-3 border-l-2 border-primary pl-3 text-sm text-muted-foreground">Our decision: {d.resolution}</p>}
            {!closed && (
              <div className="mt-3 space-y-2">
                <Textarea rows={3} maxLength={4000} value={text} onChange={e => setDrafts(prev => ({ ...prev, [d.id]: e.target.value }))} placeholder="Your response to the buyer's claim..." aria-label="Your response" />
                <Button size="sm" disabled={text.trim().length < 3 || respond.isPending} onClick={() => respond.mutate({ id: d.id, text: text.trim() })}>
                  {respond.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}{d.seller_response ? 'Update response' : 'Send response'}
                </Button>
              </div>
            )}
            {closed && d.seller_response && <p className="mt-3 text-sm text-muted-foreground">Your response: {d.seller_response}</p>}
          </article>
        );
      })}
    </div>
  );
}
