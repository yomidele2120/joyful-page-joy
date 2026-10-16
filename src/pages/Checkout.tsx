import { useState, useRef, useEffect } from 'react';
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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

// Set VITE_PAYSTACK_PUBLIC_KEY in Vercel (Settings > Environment Variables) and redeploy.
const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined;
const KLUMP_PUBLIC_KEY = import.meta.env.VITE_KLUMP_PUBLIC_KEY as string | undefined;
const VAT_RATE = 0.075;

// klump.js may expose its checkout class as a plain global (not on window), so look for both.
declare const Klump: any;
function getKlump(): any {
  try { if (typeof Klump !== 'undefined') return Klump; } catch { /* not defined */ }
  return (window as any).Klump;
}

// Dots that grow and shrink (. .. ... .. .) so the buyer can see the page is working.
const DOT_STEPS = ['.', '..', '...', '..'];
function AnimatedDots() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep(s => (s + 1) % DOT_STEPS.length), 350);
    return () => window.clearInterval(timer);
  }, []);
  // Fixed width so the text next to it does not jump as the dots change.
  return <span aria-hidden="true" className="inline-block w-[1.1em] text-left">{DOT_STEPS[step]}</span>;
}

type PayMethod = 'card' | 'bnpl';
interface PublicFinance {
  bnpl_enabled: boolean; bnpl_min_order: number; bnpl_max_order: number;
  bnpl_fee_percent: number; bnpl_fee_bearer: 'platform' | 'supplier' | 'customer';
}

// Klump's script (js.useklump.com/klump.js) is also loaded with the page in index.html, as Klump's docs say.
// This makes sure it is really there before we open the widget, and gives a clear message if it is blocked.
function loadKlumpScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ready = () => !!getKlump();
    if (ready()) return resolve();
    if (!document.querySelector('script[src*="js.useklump.com"]')) {
      const script = document.createElement('script');
      script.src = 'https://js.useklump.com/klump.js';
      script.async = true;
      document.head.appendChild(script);
    }
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (ready()) { window.clearInterval(timer); resolve(); }
      else if (Date.now() - started > 8000) {
        window.clearInterval(timer);
        console.error('Klump script did not define Klump. Globals containing "lump":',
          Object.keys(window).filter(k => k.toLowerCase().includes('lump')));
        reject(new Error('Pay later could not start because the Klump script did not load. Turn off any ad blocker, refresh the page and try again.'));
      }
    }, 100);
  });
}

export default function Checkout() {
  const { items, totalPrice, clearCart } = useCart();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '' });
  const [searchParams] = useSearchParams();
  const wantsLater = searchParams.get('pay') === 'later';
  const [method, setMethod] = useState<PayMethod>(wantsLater ? 'bnpl' : 'card');
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
  // Wake the payment functions up while the buyer fills in the form. Cloud functions that have been idle
  // take a few seconds to start; doing it now means the pay button responds straight away.
  const warmedUp = useRef(false);
  useEffect(() => {
    if (!user || warmedUp.current || !items.length) return;
    warmedUp.current = true;
    void supabase.functions.invoke('initialize-payment', { body: { warmup: true } }).catch(() => {});
    void supabase.functions.invoke('klump-initialize', { body: { warmup: true } }).catch(() => {});
  }, [user, items.length]);

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

  // Wait for the saved sign-in to be restored, otherwise signed-in buyers briefly see "Please sign in".
  if (authLoading && !user) {
    return (
      <Layout>
        <div className="container max-w-2xl space-y-4 py-8">
          <div className="h-9 w-40 animate-pulse bg-secondary" />
          <div className="h-12 animate-pulse bg-secondary" />
          <div className="h-12 animate-pulse bg-secondary" />
          <div className="h-12 animate-pulse bg-secondary" />
          <div className="h-48 animate-pulse bg-secondary" />
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
      const KlumpCheckout = getKlump();
      if (!KlumpCheckout) throw new Error('Pay later could not start. Please refresh the page and try again.');

      // 3. Open Klump. When it reports success the server double-checks with Klump before the order counts as paid.
      new KlumpCheckout({
        publicKey: KLUMP_PUBLIC_KEY,
        data: init.data,
        // Klump requires every callback to be provided, even the ones we do not need.
        onLoad: () => { /* widget ready */ },
        onOpen: () => { /* widget opened */ },
        onSuccess: async (response: unknown) => {
          klumpDone.current = true;
          // Klump stores a redirect URL right after this callback returns; replace it so the page is not redirected.
          window.setTimeout(() => { try { window.localStorage.setItem('klump_redirect_url', 'false'); } catch { /* ignore */ } }, 0);
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
          // Klump's script redirects the browser to a stored URL when its window closes after a payment.
          // We confirm the payment ourselves, so switch that redirect off (it reads this value right after onClose).
          try { window.localStorage.setItem('klump_redirect_url', 'false'); } catch { /* storage unavailable */ }
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

          {wantsLater && finance && eligibility && !bnplAvailable && (
            <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
              Pay later is not available for this order. Every item in your cart must allow it, and the total must be between {formatNaira(Number(finance.bnpl_min_order))} and {formatNaira(Number(finance.bnpl_max_order))}. You can still pay by card.
            </p>
          )}
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
            {loading ? <span className="inline-flex items-center">Preparing secure payment<AnimatedDots /></span> : usingBnpl ? `Continue with Pay later (${formatNaira(grandTotal)})` : `Pay ${formatNaira(grandTotal)} with Paystack`}
          </Button>
          {loading && (
            <p role="status" aria-live="polite" className="flex items-center justify-center gap-2 pt-1 text-center text-sm text-muted-foreground">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span>Preparing secure payment<AnimatedDots /> please don't close this page</span>
            </p>
          )}
        </form>
      </div>
    </Layout>
  );
}
