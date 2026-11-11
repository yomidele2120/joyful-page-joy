import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

interface Row { id: string; vendor_id: string; business_name: string; registration_number: string | null; business_address: string | null;
  document_paths: string[]; status: 'pending' | 'approved' | 'rejected'; admin_note: string | null; created_at: string; vendors: { store_name: string } | null }

// Admin: read a supplier's business documents, then verify (adds the Verified badge) or send it back with a reason.
export default function VendorVerificationPanel() {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const { data, isLoading } = useQuery({
    queryKey: ['admin-vendor-verifications'],
    queryFn: async () => {
      const { data, error } = await db.from('vendor_verification_requests').select('*, vendors(store_name)').order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await db.rpc('review_vendor_verification', { _request: id, _approve: approve, _note: notes[id] ?? null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Saved'); queryClient.invalidateQueries({ queryKey: ['admin-vendor-verifications'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = async (path: string) => {
    const { data: signed, error } = await supabase.storage.from('vendor-verification').createSignedUrl(path, 300);
    if (error || !signed) { toast.error('Could not open the document'); return; }
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;
  return (
    <section className="space-y-3">
      <p className="text-xs text-muted-foreground">Check the registration documents (for example CAC certificate, tax ID, a utility bill for the business address). Verifying adds the Verified badge to the supplier's shop, products and quotations.</p>
      {!data?.length && <p className="rounded-lg bg-card p-5 text-sm text-muted-foreground card-shadow">No verification requests yet.</p>}
      {data?.map(r => (
        <article key={r.id} className="rounded-lg bg-card p-5 card-shadow">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{r.business_name} <span className="text-xs font-normal text-muted-foreground">(shop: {r.vendors?.store_name ?? '-'})</span></p>
            <Badge variant={r.status === 'pending' ? 'secondary' : r.status === 'approved' ? 'default' : 'destructive'}>{r.status}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Registration no: {r.registration_number || '-'} · {r.business_address || 'No address given'} · sent {new Date(r.created_at).toLocaleDateString()}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {r.document_paths.map((p, i) => (
              <button key={p} type="button" onClick={() => open(p)} className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-xs text-primary hover:underline">
                <FileText className="h-3 w-3" /> Document {i + 1}
              </button>
            ))}
          </div>
          {r.status === 'pending' ? (
            <>
              <Textarea className="mt-3" rows={2} placeholder="Note to the supplier (required if you send it back)" aria-label="Note" value={notes[r.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))} />
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={review.isPending} onClick={() => review.mutate({ id: r.id, approve: true })}>Verify supplier</Button>
                <Button size="sm" variant="outline" disabled={review.isPending || !(notes[r.id] ?? '').trim()} onClick={() => review.mutate({ id: r.id, approve: false })}>Send back</Button>
              </div>
            </>
          ) : r.admin_note && <p className="mt-2 text-sm"><strong>Note:</strong> {r.admin_note}</p>}
        </article>
      ))}
    </section>
  );
}
