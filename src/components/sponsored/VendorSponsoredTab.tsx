// Vendor side: ask for a product to be promoted, follow the request, and read the report for your own products.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Panel, StatusDot } from '@/components/dashboard/DashboardShell';
import { supabase } from '@/integrations/supabase/client';
import { naira } from '@/lib/sponsored';
import SponsoredReport, { selectClass } from './SponsoredReport';

const db = supabase as any;
const TONE: Record<string, 'good' | 'warn' | 'bad' | 'idle'> = { pending: 'warn', approved: 'good', rejected: 'bad', withdrawn: 'idle' };
const LABEL: Record<string, string> = { pending: 'Waiting for review', approved: 'Approved', rejected: 'Not approved', withdrawn: 'Withdrawn' };

export default function VendorSponsoredTab({ vendorId }: { vendorId: string }) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(''); const [budget, setBudget] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false);
  const { data: products = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['sponsored-my-products', vendorId],
    queryFn: async () => { const { data, error } = await db.from('products').select('id, name').eq('vendor_id', vendorId).order('name'); if (error) throw error; return data; },
  });
  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['sponsored-my-requests', vendorId],
    queryFn: async () => { const { data, error } = await db.from('sponsored_requests').select('id, status, preferred_budget, note, admin_note, created_at, products(name)').eq('vendor_id', vendorId).order('created_at', { ascending: false }); if (error) throw error; return data; },
  });

  const submit = async () => {
    if (!productId) return toast.error('Choose a product first');
    setBusy(true);
    const { error } = await db.rpc('submit_sponsored_request', { _product_id: productId, _budget: budget === '' ? null : Number(budget), _note: note });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Request sent. ITHUBAFRICA will review it.');
    setProductId(''); setBudget(''); setNote('');
    qc.invalidateQueries({ queryKey: ['sponsored-my-requests'] });
  };
  const withdraw = async (id: string) => {
    const { error } = await db.rpc('withdraw_sponsored_request', { _id: id });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ['sponsored-my-requests'] });
  };

  return (
    <div className="space-y-5">
      <Panel title="Ask for a product to be promoted on TikTok">
        <div className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">ITHUBAFRICA runs all TikTok advertising from one account. Send a request and the team will review it. Nothing is charged when you send a request.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-muted-foreground">Product
              <select className={`${selectClass} mt-1 w-full`} value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">Choose a product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
            <label className="text-xs text-muted-foreground">Preferred budget in naira (optional)
              <Input type="number" min={0} max={10000000} value={budget} onChange={e => setBudget(e.target.value)} className="mt-1" /></label>
          </div>
          <Textarea placeholder="Anything the team should know (optional)" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
          <Button onClick={submit} disabled={busy}>{busy ? 'Sending...' : 'Send request'}</Button>
        </div>
      </Panel>

      <Panel title="Your requests" flush>
        <ul className="divide-y divide-border">
          {requests.map(r => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div><p className="font-medium">{r.products?.name ?? 'Product'}</p>
                <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()} · Preferred budget {r.preferred_budget == null ? 'not given' : naira(Number(r.preferred_budget))}</p>
                {r.admin_note && <p className="mt-1 text-xs">Note from ITHUBAFRICA: {r.admin_note}</p>}</div>
              <div className="flex items-center gap-3"><StatusDot tone={TONE[r.status] ?? 'idle'}>{LABEL[r.status] ?? r.status}</StatusDot>
                {r.status === 'pending' && <Button size="sm" variant="outline" onClick={() => withdraw(r.id)}>Withdraw</Button>}</div>
            </li>
          ))}
          {!requests.length && <li className="px-4 py-6 text-center text-sm text-muted-foreground">No requests yet.</li>}
        </ul>
      </Panel>

      <div><h2 className="mb-2 font-heading text-sm">Campaigns promoting your products</h2><SponsoredReport mode="vendor" /></div>
    </div>
  );
}
