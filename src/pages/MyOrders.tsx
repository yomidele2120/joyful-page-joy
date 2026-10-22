import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import Layout from '@/components/layout/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { formatNaira } from '@/lib/format';
import { formatLongDate } from '@/hooks/useMarketplace';

interface OrderItem {
  quantity: number;
  price: number;
  products: {
    id: string; name: string; slug: string; image_url: string | null; vendor_id: string | null;
    is_preorder: boolean; preorder_release_date: string | null; preorder_delivery_estimate: string | null; preorder_status: string;
    vendors: { id: string; store_name: string } | null;
  } | null;
}
interface OrderRow {
  id: string; status: string; total: number; created_at: string; payment_method: string; is_preorder: boolean;
  order_items: OrderItem[];
}

const ORDER_STATUS: Record<string, string> = {
  pending: 'Awaiting payment', paid: 'Paid', processing: 'Being prepared', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', failed: 'Payment failed',
};
const BNPL_STATUS: Record<string, string> = {
  initiated: 'Application started, not completed', successful: 'Approved and paid', abandoned: 'Not completed', failed: 'Payment did not go through',
};
const REQUEST_STATUS: Record<string, string> = { requested: 'Waiting for review', approved: 'Approved', rejected: 'Not approved', refunded: 'Refunded' };
const DISPUTE_STATUS: Record<string, string> = { open: 'Open', seller_responded: 'Seller responded', under_review: 'Under review', resolved: 'Resolved', closed: 'Closed' };
const REASONS: Record<string, string> = {
  not_received: 'I did not receive my order', not_as_described: 'Item is not as described', damaged: 'Item arrived damaged',
  late_preorder: 'Preorder is very late', refund_not_received: 'I have not received my refund', other: 'Something else',
};
const OUTCOMES: Record<string, string> = { refund: 'A refund', replacement: 'A replacement', other: 'Something else' };

const PAID_STATES = ['paid', 'processing', 'shipped', 'delivered'];

export default function MyOrders() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [requestFor, setRequestFor] = useState<{ order: OrderRow; kind: 'cancel' | 'refund' } | null>(null);
  const [disputeFor, setDisputeFor] = useState<OrderRow | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['my-orders', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total, created_at, payment_method, is_preorder, order_items(quantity, price, products(id, name, slug, image_url, vendor_id, is_preorder, preorder_release_date, preorder_delivery_estimate, preorder_status, vendors(id, store_name)))')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });

  const bnplOrderIds = useMemo(() => (orders ?? []).filter(o => o.payment_method === 'bnpl').map(o => o.id), [orders]);
  const { data: bnpl } = useQuery({
    queryKey: ['my-bnpl', bnplOrderIds],
    enabled: bnplOrderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_my_bnpl_status', { _order_ids: bnplOrderIds });
      if (error) throw error;
      return new Map((data ?? []).map(r => [r.order_id, r.status] as [string, string]));
    },
  });

  const { data: requests } = useQuery({
    queryKey: ['my-order-requests', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('order_requests').select('*').eq('user_id', user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: disputes } = useQuery({
    queryKey: ['my-disputes', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('disputes').select('*').eq('buyer_id', user!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const withdraw = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('disputes').update({ status: 'closed' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Dispute withdrawn'); queryClient.invalidateQueries({ queryKey: ['my-disputes'] }); },
    onError: () => toast.error('Could not withdraw the dispute'),
  });

  const shown = (orders ?? []).filter(o => filter === 'all' || (filter === 'preorder' ? o.is_preorder : o.payment_method === 'bnpl'));

  if (authLoading) return <Layout><div className="container py-16 text-center text-muted-foreground">Loading...</div></Layout>;
  if (!user) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="font-heading text-2xl font-bold">Sign in to see your orders</h1>
          <Link to="/users-login"><Button className="mt-5">Sign in</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container max-w-4xl py-6 sm:py-10">
        <h1 className="font-heading text-2xl font-bold sm:text-3xl">My orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Follow orders and preorders, see your Pay later status, and ask for a cancellation, a refund or help with a problem. See the{' '}
          <Link to="/returns-policy" className="text-primary hover:underline">Return, Refund and Cancellation Policy</Link>.
        </p>

        <Tabs value={filter} onValueChange={setFilter} className="mt-5">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="preorder">Preorders</TabsTrigger>
            <TabsTrigger value="bnpl">Pay later</TabsTrigger>
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="mt-6 space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 animate-pulse bg-secondary" />)}</div>
        ) : !shown.length ? (
          <div className="mt-6 border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No orders here yet. <Link to="/products" className="text-primary hover:underline">Browse products</Link>.
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {shown.map(order => {
              const openRequests = (requests ?? []).filter(r => r.order_id === order.id);
              const hasOpenCancel = openRequests.some(r => r.kind === 'cancel' && r.status === 'requested');
              const hasOpenRefund = openRequests.some(r => r.kind === 'refund' && r.status === 'requested');
              const orderDisputes = (disputes ?? []).filter(d => d.order_id === order.id);
              const hasOpenDispute = orderDisputes.some(d => !['resolved', 'closed'].includes(d.status));
              const canCancel = ['pending', 'paid', 'processing'].includes(order.status) && !hasOpenCancel;
              const canRefund = PAID_STATES.includes(order.status) && !hasOpenRefund;
              const canDispute = PAID_STATES.includes(order.status) && !hasOpenDispute;
              return (
                <li key={order.id} className="border border-border bg-card">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3 text-sm">
                    <div>
                      <span className="font-heading font-semibold">Order #{order.id.slice(0, 8).toUpperCase()}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {order.is_preorder && <Badge className="rounded-full bg-accent text-accent-foreground"><CalendarClock className="mr-1 h-3 w-3" />Preorder</Badge>}
                      {order.payment_method === 'bnpl' && <Badge className="rounded-full bg-primary/10 text-primary"><Wallet className="mr-1 h-3 w-3" />Pay later</Badge>}
                      <Badge variant="secondary" className="rounded-full">{ORDER_STATUS[order.status] ?? order.status}</Badge>
                    </div>
                  </div>

                  <ul className="divide-y divide-border">
                    {order.order_items.map((item, i) => (
                      <li key={i} className="flex gap-3 p-3">
                        <img src={item.products?.image_url || '/placeholder.svg'} alt="" className="h-14 w-14 shrink-0 bg-white object-contain" />
                        <div className="min-w-0 flex-1 text-sm">
                          {item.products ? <Link to={`/product/${item.products.slug}`} className="line-clamp-2 font-medium hover:text-primary">{item.products.name}</Link> : <span>Product no longer listed</span>}
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} x {formatNaira(item.price)}{item.products?.vendors ? ` - sold by ${item.products.vendors.store_name}` : ''}
                          </p>
                          {item.products?.is_preorder && (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {item.products.preorder_status === 'ready'
                                ? 'Now available, being prepared for delivery.'
                                : <>Expected {formatLongDate(item.products.preorder_release_date) || 'date to be confirmed'}{item.products.preorder_delivery_estimate ? `, delivery around ${formatLongDate(item.products.preorder_delivery_estimate)}` : ''}.</>}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="space-y-2 border-t border-border p-3 text-sm">
                    <p className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-heading font-bold">{formatNaira(order.total)}</span></p>
                    {order.payment_method === 'bnpl' && (
                      <p className="text-xs text-muted-foreground">
                        Pay later (Klump): <strong className="text-foreground">{BNPL_STATUS[bnpl?.get(order.id) ?? ''] ?? 'Checking status'}</strong>.
                        Your instalment plan and repayments are shown by Klump. See the <Link to="/bnpl-terms" className="text-primary hover:underline">BNPL Terms</Link>.
                      </p>
                    )}
                    {order.is_preorder && <p className="text-xs text-muted-foreground">Preorder rules: <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link>.</p>}

                    {openRequests.map(r => (
                      <p key={r.id} className="border-l-2 border-primary pl-3 text-xs text-muted-foreground">
                        {r.kind === 'cancel' ? 'Cancellation' : 'Refund'} request: <strong className="text-foreground">{REQUEST_STATUS[r.status] ?? r.status}</strong>
                        {r.admin_note ? <> - {r.admin_note}</> : null}
                      </p>
                    ))}
                    {orderDisputes.map(d => (
                      <div key={d.id} className="border-l-2 border-accent pl-3 text-xs text-muted-foreground">
                        <p>Dispute ({REASONS[d.reason] ?? d.reason}): <strong className="text-foreground">{DISPUTE_STATUS[d.status] ?? d.status}</strong></p>
                        {d.seller_response && <p className="mt-1 whitespace-pre-wrap">Seller: {d.seller_response}</p>}
                        {d.resolution && <p className="mt-1 whitespace-pre-wrap">Our decision: {d.resolution}</p>}
                        {!['resolved', 'closed'].includes(d.status) && (
                          <button type="button" onClick={() => withdraw.mutate(d.id)} className="mt-1 text-primary hover:underline">Withdraw dispute</button>
                        )}
                      </div>
                    ))}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {canCancel && <Button size="sm" variant="outline" onClick={() => setRequestFor({ order, kind: 'cancel' })}>Request cancellation</Button>}
                      {canRefund && <Button size="sm" variant="outline" onClick={() => setRequestFor({ order, kind: 'refund' })}>Request refund</Button>}
                      {canDispute && <Button size="sm" variant="outline" onClick={() => setDisputeFor(order)}>Open a dispute</Button>}
                      <Link to={`/contact?type=order&order=${order.id}`}><Button size="sm" variant="ghost">Contact support</Button></Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <RequestDialog target={requestFor} onClose={() => setRequestFor(null)} onDone={() => { setRequestFor(null); queryClient.invalidateQueries({ queryKey: ['my-order-requests'] }); }} userId={user.id} />
      <DisputeDialog order={disputeFor} onClose={() => setDisputeFor(null)} onDone={() => { setDisputeFor(null); queryClient.invalidateQueries({ queryKey: ['my-disputes'] }); }} userId={user.id} />
    </Layout>
  );
}

function RequestDialog({ target, onClose, onDone, userId }: {
  target: { order: OrderRow; kind: 'cancel' | 'refund' } | null; onClose: () => void; onDone: () => void; userId: string;
}) {
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('order_requests').insert({ order_id: target!.order.id, user_id: userId, kind: target!.kind, reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Request sent. We will review it and notify you.'); setReason(''); onDone(); },
    onError: (err: Error) => toast.error(err.message || 'Could not send your request'),
  });
  if (!target) return null;
  const isCancel = target.kind === 'cancel';
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCancel ? 'Request cancellation' : 'Request a refund'}</DialogTitle>
          <DialogDescription>
            Order #{target.order.id.slice(0, 8).toUpperCase()}. We review every request and tell you the result. Refunds go back to the way you paid.
            {target.order.payment_method === 'bnpl' && ' For Pay later orders we work with Klump on the refund.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="req-reason">{isCancel ? 'Why do you want to cancel?' : 'What went wrong?'}</Label>
          <Textarea id="req-reason" rows={4} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={reason.trim().length < 5 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisputeDialog({ order, onClose, onDone, userId }: { order: OrderRow | null; onClose: () => void; onDone: () => void; userId: string }) {
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState('not_as_described');
  const [outcome, setOutcome] = useState('refund');
  const [details, setDetails] = useState('');

  const vendors = useMemo(() => {
    const map = new Map<string, string>();
    order?.order_items.forEach(i => { if (i.products?.vendors) map.set(i.products.vendors.id, i.products.vendors.store_name); });
    return [...map.entries()];
  }, [order]);
  const chosen = vendorId || (vendors.length === 1 ? vendors[0][0] : '');

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('disputes').insert({
        order_id: order!.id, buyer_id: userId, vendor_id: chosen, reason, desired_outcome: outcome, details: details.trim(),
      });
      if (error) {
        if (error.code === '23505') throw new Error('You already have an open dispute with this seller on this order.');
        throw error;
      }
    },
    onSuccess: () => { toast.success('Dispute opened. The seller has been asked to respond.'); setDetails(''); onDone(); },
    onError: (err: Error) => toast.error(err.message || 'Could not open the dispute'),
  });
  if (!order) return null;
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a dispute</DialogTitle>
          <DialogDescription>
            Order #{order.id.slice(0, 8).toUpperCase()}. Please try to sort it out with the seller in <Link to="/messages" className="text-primary hover:underline">Messages</Link> first. See the{' '}
            <Link to="/dispute-resolution" className="text-primary hover:underline">Dispute Resolution Policy</Link>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {vendors.length > 1 && (
            <div className="space-y-1.5"><Label>Seller</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Choose the seller" /></SelectTrigger>
                <SelectContent>{vendors.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>What is the problem?</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REASONS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>What outcome would you like?</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(OUTCOMES).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="disp-details">Tell us what happened</Label>
            <Textarea id="disp-details" rows={5} maxLength={4000} value={details} onChange={e => setDetails(e.target.value)} placeholder="Dates, what you agreed, what you received..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button disabled={!chosen || details.trim().length < 10 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Open dispute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
