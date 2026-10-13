import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { useProduct, useProducts } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShoppingCart, Truck, ShieldCheck, RotateCcw, MessageCircle, Store, MessageSquare, ChevronRight, PackageCheck } from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { toast } from 'sonner';

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const { data: recommendations } = useProducts({ categorySlug: product?.categories?.slug, limit: 8 });
  const { addItem } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState(0);

  const handleInAppChat = (vendorUserId: string, productName: string) => {
    if (!user) {
      toast.error('Please log in to chat with the seller');
      navigate('/users-login');
      return;
    }
    if (user.id === vendorUserId) {
      toast.info("This is your own product");
      return;
    }
    navigate(`/chat?vendor=${vendorUserId}&product=${encodeURIComponent(productName)}`);
  };

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

  const gallery = [...new Set([product.image_url, ...(product.images || [])].filter((image): image is string => !!image))];
  const selectedImage = gallery[activeImage] || '/placeholder.svg';
  const vendor = product.vendors;

  return (
    <Layout>
      <div className="container max-w-[1280px] px-4 py-4 sm:py-7">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
          <Link to="/" className="shrink-0 hover:text-primary">Home</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link to="/products" className="shrink-0 hover:text-primary">Products</Link>
          {product.categories?.name && <><ChevronRight className="h-3 w-3 shrink-0" /><span className="truncate">{product.categories.name}</span></>}
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-10">
          <section className="min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-white sm:aspect-[1.08/1]">
              <img src={selectedImage} alt={product.name} className="h-full w-full object-contain p-3 sm:p-8" />
              {product.badge && <Badge className="absolute left-3 top-3 rounded-sm border-none bg-primary/10 text-primary">{product.badge}</Badge>}
            </div>
            {gallery.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {gallery.map((image, index) => (
                  <button
                    type="button"
                    key={image}
                    onClick={() => setActiveImage(index)}
                    aria-label={`View product image ${index + 1}`}
                    aria-pressed={activeImage === index}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white p-1 sm:h-20 sm:w-20 ${activeImage === index ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                  >
                    <img src={image} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {product.brand && <span className="font-medium text-foreground">{product.brand}</span>}
              {product.categories?.name && <span>{product.categories.name}</span>}
            </div>
            <h1 className="mt-2 font-heading text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>

            <div className="mt-5 border-y border-border py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-heading text-2xl font-bold text-foreground sm:text-3xl">{formatNaira(product.price)}</span>
                {product.compare_at_price && <span className="text-sm text-muted-foreground line-through">{formatNaira(product.compare_at_price)}</span>}
                {product.compare_at_price && product.compare_at_price > product.price && (
                  <span className="text-xs font-semibold text-primary">Save {Math.round((1 - product.price / product.compare_at_price) * 100)}%</span>
                )}
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${product.stock_quantity > 0 ? 'bg-primary' : 'bg-destructive'}`} />
                <span className={product.stock_quantity > 0 ? 'text-primary' : 'text-destructive'}>
                  {product.stock_quantity > 0 ? `${product.stock_quantity} available` : 'Currently unavailable'}
                </span>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-b border-border pb-5">
              <DetailFact icon={<PackageCheck />} label="Availability" value={product.stock_quantity > 0 ? 'In stock' : 'Sold out'} />
              <DetailFact icon={<Truck />} label="Delivery" value="Ask seller" />
              <DetailFact icon={<ShieldCheck />} label="Seller" value={vendor?.is_approved ? 'Approved' : 'Marketplace'} />
            </div>

            <div className="mt-5 grid grid-cols-[1fr_auto] gap-2">
              <Button
                size="lg"
                className="h-12 font-semibold"
                disabled={product.stock_quantity <= 0}
                onClick={() => addItem({ id: product.id, name: product.name, price: product.price, image_url: product.image_url, slug: product.slug })}
              >
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to cart
              </Button>
              <Button size="lg" variant="outline" className="h-12" onClick={() => navigate('/cart')} aria-label="Go to cart">
                View cart
              </Button>
            </div>

            {vendor && (
              <div className="mt-5 border-y border-border py-4">
                <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Seller information</p>
                <Link to={`/shop/${vendor.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                  {vendor.logo_url ? <img src={vendor.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Store className="h-5 w-5" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{vendor.store_name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{vendor.is_approved ? 'Approved seller' : 'MarketHub seller'}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleInAppChat(vendor.user_id || '', product.name)}>
                    <MessageSquare className="h-4 w-4" /> Message seller
                  </Button>
                  {(vendor.whatsapp_number || vendor.phone) && (
                    <a href={`https://wa.me/${(vendor.whatsapp_number || vendor.phone || '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'm interested in ${product.name}`)}`} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="outline" className="w-full gap-1.5"><MessageCircle className="h-4 w-4" /> WhatsApp</Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="mt-8 border-y border-border py-5 sm:mt-10">
          <h2 className="font-heading text-lg font-bold">Product description</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{product.description || 'Contact the seller for more information about this product.'}</p>
        </section>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="border-b border-border pb-5 sm:border-0">
            <h2 className="font-heading text-lg font-bold">Product details</h2>
            <dl className="mt-3 divide-y divide-border text-sm">
              {product.brand && <DetailRow label="Brand" value={product.brand} />}
              {product.categories?.name && <DetailRow label="Category" value={product.categories.name} />}
              {product.sku && <DetailRow label="SKU" value={product.sku} />}
              <DetailRow label="Availability" value={product.stock_quantity > 0 ? 'In stock' : 'Out of stock'} />
            </dl>
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold">Order information</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">Delivery timing and shipping costs can vary by seller and destination. Contact the seller before ordering if you need a delivery estimate.</p>
            <div className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Review seller terms and product details before completing your order.
            </div>
          </div>
        </section>

        {!!recommendations?.filter(item => item.id !== product.id).length && (
          <section className="mt-9 border-t border-border pt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-heading text-lg font-bold sm:text-xl">Similar products</h2>
              {product.categories?.slug && <Link to={`/category/${product.categories.slug}`} className="text-sm font-medium text-primary">View category</Link>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {recommendations.filter(item => item.id !== product.id).slice(0, 4).map(item => <ProductCard key={item.id} {...item} />)}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}

function DetailFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-primary">{icon}<span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">{label}</span></div>
      <p className="mt-1 truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}
