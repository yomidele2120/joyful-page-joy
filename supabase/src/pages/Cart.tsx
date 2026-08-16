import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { formatNaira } from '@/lib/format';

export default function Cart() {
  const { items, updateQuantity, removeItem, totalPrice } = useCart();

  if (!items.length) {
    return (
      <Layout>
        <div className="container py-16 text-center">
          <ShoppingBag className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h1 className="font-heading text-2xl font-bold mb-2">Your Cart is Empty</h1>
          <p className="text-muted-foreground mb-6">Browse our products and add items to your cart.</p>
          <Link to="/products"><Button>Continue Shopping</Button></Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8">
        <h1 className="font-heading text-3xl font-bold mb-6">Shopping Cart</h1>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map(item => (
              <div key={item.id} className="flex gap-4 bg-card p-4 rounded-lg card-shadow">
                <img src={item.image_url || '/placeholder.svg'} alt={item.name} className="w-20 h-20 rounded-md object-cover bg-secondary" />
                <div className="flex-1 min-w-0">
                  <Link to={`/product/${item.slug}`} className="font-heading font-semibold text-sm hover:text-primary line-clamp-2">{item.name}</Link>
                  <p className="font-heading font-bold text-primary mt-1">{formatNaira(item.price)}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                      <Minus className="w-3 h-3" />
                    </Button>
                    <span className="text-sm font-medium w-8 text-center">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive ml-auto" onClick={() => removeItem(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card p-6 rounded-lg card-shadow h-fit sticky top-28">
            <h3 className="font-heading font-bold text-lg mb-4">Order Summary</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatNaira(totalPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span className="text-primary font-medium">Free</span>
              </div>
            </div>
            <div className="border-t border-border mt-4 pt-4 flex justify-between font-heading font-bold text-lg">
              <span>Total</span>
              <span className="text-primary">{formatNaira(totalPrice)}</span>
            </div>
            <Link to="/checkout">
              <Button className="w-full mt-4 font-heading font-semibold" size="lg">
                Proceed to Checkout
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
