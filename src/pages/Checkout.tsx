import { useState } from 'react';
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
const VAT_RATE = 0.075;

export default function Checkout() {
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', address: '', city: '', state: '' });

  const vatAmount = totalPrice * VAT_RATE;
  const grandTotal = totalPrice + vatAmount;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
                <span>{formatNaira(vatAmount)}</span>
              </div>
              <div className="flex justify-between font-heading font-bold text-lg pt-2 border-t border-border">
                <span>Total</span>
                <span className="text-primary">{formatNaira(grandTotal)}</span>
              </div>
            </div>
          </div>

          <Button type="submit" size="lg" className="w-full font-heading font-semibold mt-4" disabled={loading}>
            {loading ? 'Processing...' : `Pay ${formatNaira(grandTotal)} with Paystack`}
          </Button>
        </form>
      </div>
    </Layout>
  );
}
