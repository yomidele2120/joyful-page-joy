import { useParams, Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { useProduct } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Heart, Truck, Shield, RotateCcw, MessageCircle, Store } from 'lucide-react';
import { formatNaira } from '@/lib/format';

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const { addItem } = useCart();

  if (isLoading) {
    return (
      <Layout>
        <div className="container py-12">
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square bg-secondary rounded-lg animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 bg-secondary rounded w-3/4 animate-pulse" />
              <div className="h-6 bg-secondary rounded w-1/3 animate-pulse" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!product) {
    return <Layout><div className="container py-12 text-center"><h1 className="text-2xl font-heading font-bold">Product not found</h1></div></Layout>;
  }

  return (
    <Layout>
      <div className="container py-8">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="relative aspect-square rounded-lg overflow-hidden bg-secondary">
            <img src={product.image_url || '/placeholder.svg'} alt={product.name} className="w-full h-full object-cover" />
            {product.badge && (
              <Badge className="absolute top-4 left-4 bg-accent text-accent-foreground border-none">{product.badge}</Badge>
            )}
          </div>

          <div>
            <span className="text-sm text-muted-foreground uppercase tracking-wider">{product.brand}</span>
            <h1 className="font-heading text-2xl md:text-3xl font-bold mt-1 text-foreground">{product.name}</h1>
            
            <div className="flex items-baseline gap-3 mt-4">
              <span className="font-heading text-3xl font-bold text-primary">{formatNaira(product.price)}</span>
              {product.compare_at_price && (
                <span className="text-lg text-muted-foreground line-through">{formatNaira(product.compare_at_price)}</span>
              )}
            </div>

            <p className="mt-4 text-muted-foreground leading-relaxed">{product.description}</p>

            <div className="flex items-center gap-2 mt-2">
              <span className={`text-sm font-medium ${product.stock_quantity > 0 ? 'text-primary' : 'text-destructive'}`}>
                {product.stock_quantity > 0 ? `${product.stock_quantity} in stock` : 'Out of stock'}
              </span>
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                size="lg"
                className="flex-1 font-heading font-semibold"
                disabled={product.stock_quantity <= 0}
                onClick={() => addItem({
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  image_url: product.image_url,
                  slug: product.slug,
                })}
              >
                <ShoppingCart className="w-5 h-5 mr-2" /> Add to Cart
              </Button>
              <Button size="lg" variant="outline">
                <Heart className="w-5 h-5" />
              </Button>
            </div>

            {/* Seller Info */}
            {(product as any).vendors && (
              <div className="mt-6 p-4 bg-secondary rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Sold by</p>
                <div className="flex items-center justify-between">
                  <Link to={`/shop/${(product as any).vendors.id}`} className="flex items-center gap-2 hover:text-primary transition-colors">
                    {(product as any).vendors.logo_url ? (
                      <img src={(product as any).vendors.logo_url} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <Store className="w-5 h-5 text-primary" />
                    )}
                    <span className="font-heading font-semibold">{(product as any).vendors.store_name}</span>
                    {(product as any).vendors.is_approved && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">✓</span>}
                  </Link>
                  {((product as any).vendors.whatsapp_number || (product as any).vendors.phone) && (
                    <a href={`https://wa.me/${((product as any).vendors.whatsapp_number || (product as any).vendors.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${product.name}`)}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="gap-1 text-xs">
                        <MessageCircle className="w-3 h-3" /> WhatsApp Seller
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
              <div className="flex flex-col items-center text-center gap-2">
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-xs text-muted-foreground">Fast Delivery</span>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <span className="text-xs text-muted-foreground">Warranty</span>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <RotateCcw className="w-5 h-5 text-primary" />
                <span className="text-xs text-muted-foreground">Easy Returns</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
