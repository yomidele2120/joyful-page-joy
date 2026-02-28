import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatNaira } from '@/lib/format';
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const PAYSTACK_PUBLIC_KEY = 'pk_live_14c84e1b048ede3b5a8d074ecc566bab9bfc9bad';
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
    setLoading(true);

    try {
      // Create order
      const { data: order, error: orderError } = await supabase.from('orders').insert({
        user_id: user.id,
        email: formData.email,
        phone: formData.phone,
        shipping_address: formData.address,
        shipping_city: formData.city,
        shipping_state: formData.state,
        total: grandTotal,
        status: 'pending',
      }).select().single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.id,
        quantity: item.quantity,
        price: item.price,
      }));
      await supabase.from('order_items').insert(orderItems);

      // Initialize payment via edge function
      const { data: paymentData, error: paymentError } = await supabase.functions.invoke('initialize-payment', {
        body: {
          email: formData.email,
          amount: grandTotal,
          orderId: order.id,
          metadata: { customer_name: formData.name, items_count: items.length },
        },
      });

      if (paymentError) throw paymentError;

      // Load Paystack inline
      const handler = (window as any).PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: formData.email,
        amount: Math.round(grandTotal * 100),
        currency: 'NGN',
        ref: paymentData.reference,
        callback: async (response: any) => {
          try {
            const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-payment', {
              body: { reference: response.reference },
            });

            if (verifyError) throw verifyError;

            clearCart();
            toast.success('Payment successful! Your order has been placed.');
            navigate('/');
          } catch (err: any) {
            toast.error('Payment verification failed. Please contact support.');
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
                <span>{formatNaira(item.price * item.quantity)}</span>
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
