import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { functionErrorMessage } from '@/lib/functionError';
import Layout from '@/components/layout/Layout';
import { useCart, unitPrice } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatNaira } from '@/lib/format';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Set VITE_PAYSTACK_PUBLIC_KEY in Vercel (Settings > Environment Variables) and redeploy.
const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
const KLUMP_PUBLIC_KEY = import.meta.env.VITE_KLUMP_PUBLIC_KEY as string | undefined;
const VAT_RATE = 0.075;

type PayMethod = 'card' | 'bnpl';
interface PublicFinance {
  bnpl_enabled: boolean; bnpl_min_order: number; bnpl_max_order: number;
  bnpl_fee_percent: number; bnpl_fee_bearer: 'platform' | 'supplier' | 'customer';
}

// Klump's checkout widget is loaded only when someone actually chooses Pay later.
function loadKlumpScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Klump) return resolve();
    const existing = document.querySelector('script[data-klump]') as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Could not load Pay later. Check your connection and try again.')));
    if (!existing) {
      script.src = 'https://js.useklump.com/klump.js';
      script.async = true;
      script.setAttribute('data-klump', '1');
      document.head.appendChild(script);
    }
  });
}

export default function Checkout() {
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '' });
  const [method, setMethod] = useState<PayMethod>('card');
  const klumpDone = useRef(false);

  // Pay later is offered only when it is switched on, the Klump key is set, every item in the
  // cart was marked "Pay later" by its supplier, and the total is inside the admin's limits.
  // (The database re-checks all of this when the order is created.)
  const { data: finance } = useQuery({
    queryKey: ['public-finance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_finance_settings');
      if (error) throw error;
      return data as unknown as PublicFinance;
    },
    staleTime: 60_000,
  });
  const itemIds = items.map(i => i.id);
  const { data: eligibility } = useQuery({
    queryKey: ['bnpl-eligibility', itemIds.join(',')],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, bnpl_eligible').in('id', itemIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const vatAmount = totalPrice * VAT_RATE;
  const cardTotal = totalPrice + vatAmount;

  // What Pay later would cost (whole naira, like the server)
  const bnplBase = Math.round(totalPrice * (1 + VAT_RATE));
  const bnplFee = finance ? Math.round(bnplBase * Number(finance.bnpl_fee_percent) / 100) : 0;
  const bnplCustomerFee = finance?.bnpl_fee_bearer === 'customer' ? bnplFee : 0;
  const bnplTotal = bnplBase + bnplCustomerFee;
  const allEligible = !!eligibility && eligibility.length === itemIds.length && eligibility.every(p => p.bnpl_eligible);
  const bnplAvailable = !!KLUMP_PUBLIC_KEY && !!finance?.bnpl_enabled && allEligible
    && bnplBase >= Number(finance.bnpl_min_order) && bnplBase <= Number(finance.bnpl_max_order);
  const usingBnpl = method === 'bnpl' && bnplAvailable;
  const grandTotal = usingBnpl ? bnplTotal : cardTotal;

  if (!items.length) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="font-heading text-2xl font-bold mb-4">Nothing to checkout</h1>
          <Link to="/products"><Button>Continue Shopping</Button></Link>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <h1 className="font-heading text-2xl font-bold mb-4">Please sign in to checkout</h1>
          <Link to="/users-login"><Button>Sign In</Button></Link>
        </div>
      </Layout>
    );
  }

  const handleBnplSubmit = async () => {
    setLoading(true);
    klumpDone.current = false;
    try {
      // 1. The order is created and priced on the server, with Pay later rules enforced there.
      const { data: created, error: orderError } = await supabase.rpc('create_order', {
        _items: items.map(item => ({ product_id: item.id, quantity: item.quantity })),
        _email: formData.email, _phone: formData.phone, _address: formData.address,
        _city: formData.city, _state: formData.state, _payment_method: 'bnpl',
      });
      if (orderError) throw orderError;
      const order = created as { order_id: string; total: number };

      // 2. The server prepares the exact Klump payload (amount and items come from the database).
      const { data: init, error: initError } = await supabase.functions.invoke('klump-initialize', {
        body: { order_id: order.order_id, customer_name: formData.name, phone: formData.phone },
      });
      if (initError || init?.error) throw new Error(await functionErrorMessage(initError, init));

      await loadKlumpScript();
      const Klump = (window as any).Klump;
      if (!Klump) throw new Error('Pay later could not start. Please try again.');

      // 3. Open Klump. When it reports success the server double-checks with Klump before the order counts as paid.
      new Klump({
        publicKey: KLUMP_PUBLIC_KEY,
        data: init.data,
        onSuccess: async (response: unknown) => {
          klumpDone.current = true;
          try {
            const { data: v, error: vErr } = await supabase.functions.invoke('klump-verify', {
              body: { order_id: order.order_id, klump_response: response },
            });
            if (vErr || v?.error) throw new Error(await functionErrorMessage(vErr, v));
            clearCart();
            if (v?.pending) toast.info('Thanks! Klump is confirming your payment. Your order will update shortly.');
            else toast.success('Your Pay later order has been placed!');
            navigate('/');
          } catch (err: any) {
            toast.error(`We could not confirm your Pay later payment: ${err?.message ?? 'unknown error'}. Please contact support.`);
            setLoading(false);
          }
        },
        onError: (err: unknown) => {
          console.error('Klump error:', err);
          toast.error('Pay later could not be completed. Please try again or pay by card.');
          setLoading(false);
        },
        onClose: () => {
          if (!klumpDone.current) { toast.info('Pay later cancelled.'); setLoading(false); }
        },
      });
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usingBnpl) { await handleBnplSubmit(); return; }
    if (!PAYSTACK_PUBLIC_KEY) {
      toast.error('Payments are not set up yet: VITE_PAYSTACK_PUBLIC_KEY is missing.');
      return;
    }
    setLoading(true);

    try {
      // The order is created and priced on the server: unit prices (including
      // quantity tiers), MOQ, stock and VAT are all calculated from the
      // database, so nothing the browser sends can change what is charged.
      const { data: created, error: orderError } = await supabase.rpc('create_order', {
        _items: items.map(item => ({ product_id: item.id, quantity: item.quantity })),
        _email: formData.email,
        _phone: formData.phone,
        _address: formData.address,
        _city: formData.city,
        _state: formData.state,
      });
      if (orderError) throw orderError;

      const order = created as { order_id: string; total: number };

      // Initialize payment via edge function (the amount is read from the order server-side)
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('initialize-payment', {
        body: {
          email: formData.email,
          orderId: order.order_id,
          metadata: { customer_name: formData.name, items_count: items.length },
        },
      });

      if (paymentError || paymentData?.error) {
        const base = await functionErrorMessage(paymentError, paymentData);
        const total = Number(order.total);
        const msg = `${base} [order total: N${total.toLocaleString('en-NG')} = ${Math.round(total * 100)} kobo; public key: ${(PAYSTACK_PUBLIC_KEY || 'MISSING').slice(0, 8)}...]`;
        console.error('initialize-payment failed:', msg, { created, paymentError, paymentData });
        throw new Error(msg);
      }

      // Load Paystack inline
      const handler = (window as any).PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: formData.email,
        amount: Math.round(Number(paymentData.amount) * 100),
        currency: 'NGN',
        ref: paymentData.reference,
        access_code: paymentData.access_code,
        callback: async (response: any) => {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-payment', {
              body: { reference: response.reference },
            });

            if (verifyError || verifyData?.error) {
              const msg = await functionErrorMessage(verifyError, verifyData);
              console.error('verify-payment failed:', msg, verifyError);
              throw new Error(msg);
            }

            clearCart();
            toast.success('Payment successful! Your order has been placed.');
            navigate('/');
          } catch (err: any) {
            toast.error(`Payment verification failed: ${err?.message ?? 'unknown error'}. Please contact support.`);
          }
        },
        onClose: () => {
          toast.info('Payment cancelled.');
          setLoading(false);
        },
      });
      handler.openIframe();
    } catch (err: any) {
      toast.error(err.message || 'Something went wrong');
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="container py-8 max-w-2xl">
        <h1 className="font-heading text-3xl font-bold mb-6">Checkout</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Full Name</Label><Input value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} required /></div>
            <div><Label>Email</Label><Input type="email" value={formData.email} onChange={e => setFormData(p => ({ ...p, email: e.target.value }))} required /></div>
            <div><Label>Phone</Label><Input value={formData.phone} onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))} required /></div>
            <div><Label>State</Label><Input value={formData.state} onChange={e => setFormData(p => ({ ...p, state: e.target.value }))} required /></div>
          </div>
          <div><Label>Address</Label><Input value={formData.address} onChange={e => setFormData(p => ({ ...p, address: e.target.value }))} required /></div>
          <div><Label>City</Label><Input value={formData.city} onChange={e => setFormData(p => ({ ...p, city: e.target.value }))} required /></div>

          {bnplAvailable && (
            <div className="space-y-2 pt-2">
              <h3 className="font-heading font-bold">Payment method</h3>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${method === 'card' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="pay-method" className="mt-1" checked={method === 'card'} onChange={() => setMethod('card')} />
                <span><span className="font-medium">Pay now with card or bank</span><br /><span className="text-sm text-muted-foreground">Secure payment with Paystack.</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${method === 'bnpl' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="pay-method" className="mt-1" checked={method === 'bnpl'} onChange={() => setMethod('bnpl')} />
                <span>
                  <span className="font-medium">Buy now, pay later with Klump</span><br />
                  <span className="text-sm text-muted-foreground">
                    Spread the cost in instalments. Klump checks your eligibility and shows your plan before you confirm.
                    {bnplCustomerFee > 0 && ` A pay-later fee of ${formatNaira(bnplCustomerFee)} applies.`}
                  </span>
                </span>
              </label>
            </div>
          )}

          <div className="bg-card p-6 rounded-lg card-shadow mt-6">
            <h3 className="font-heading font-bold mb-3">Order Summary</h3>
            {items.map(item => (
              <div key={item.id} className="flex justify-between text-sm py-1">
                <span>{item.name} × {item.quantity}</span>
                <span>{formatNaira(unitPrice(item) * item.quantity)}</span>
              </div>
            ))}
            <div className="border-t border-border mt-3 pt-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span>{formatNaira(totalPrice)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>VAT (7.5%)</span>
                <span>{formatNaira(usingBnpl ? bnplBase - totalPrice : vatAmount)}</span>
              </div>
              {usingBnpl && bnplCustomerFee > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Pay later fee</span>
                  <span>{formatNaira(bnplCustomerFee)}</span>
                </div>
              )}
              <div className="flex justify-between font-heading font-bold text-lg pt-2 border-t border-border">
                <span>Total</span>
                <span className="text-primary">{formatNaira(grandTotal)}</span>
              </div>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full font-heading font-semibold mt-4" disabled={loading}>
            {loading ? 'Processing...' : usingBnpl ? `Continue with Pay later (${formatNaira(grandTotal)})` : `Pay ${formatNaira(grandTotal)} with Paystack`}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
