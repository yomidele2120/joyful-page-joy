import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import InquiryDialog, { type InquiryDialogTarget } from '@/components/InquiryDialog';
import { useProduct, useProducts } from '@/hooks/useProducts';
import { useCart } from '@/contexts/CartContext';
import { PayLaterBadge, PreorderBadge } from '@/components/ProductBadges';
import { formatLongDate, useMarketplaceSettings, usePreorderTaken } from '@/hooks/useMarketplace';
import { useInquiryBasket } from '@/contexts/InquiryBasketContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ShoppingCart, ShieldCheck, MessageCircle, Store, MessageSquare, ChevronRight, PackageCheck,
  Minus, Plus, Send, Play, ClipboardList, BadgeCheck, CreditCard, Wallet,
} from 'lucide-react';
import { formatNaira } from '@/lib/format';
import { formatQtyRange, getMoq, parseSpecs, pluralUnit, tierRows, unitPriceFor } from '@/lib/pricing';
import { toast } from 'sonner';

const KLUMP_PUBLIC_KEY = import.meta.env.VITE_KLUMP_PUBLIC_KEY as string | undefined;

export default function ProductDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const { data: recommendations } = useProducts({ categorySlug: product?.categories?.slug, limit: 8 });
  const { addItem, items: cartItems } = useCart();
  const basket = useInquiryBasket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeImage, setActiveImage] = useState(0);
  const [showVideo, setShowVideo] = useState(false);
  const [qty, setQty] = useState<number | null>(null);
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const { data: marketplace } = useMarketplaceSettings();
  const { data: preorderTaken } = usePreorderTaken(product?.is_preorder ? [product.id] : []);
  const { data: finance } = useQuery({
    queryKey: ['public-finance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_finance_settings');
      if (error) throw error;
      return data as unknown as { bnpl_enabled: boolean; bnpl_min_order: number; bnpl_max_order: number };
    },
    staleTime: 60_000,
  });

  const handleInAppChat = (vendorUserId: string, productId: string) => {
    if (!user) {
      toast.error('Please log in to chat with the seller');
      navigate('/users-login');
      return;
    }
    if (user.id === vendorUserId) {
      toast.info("This is your own product");
      return;
    }
    navigate(`/messages?vendor=${vendorUserId}&product=${productId}`);
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

  const moq = getMoq(product);
  const unit = (product.unit || 'Piece').trim();
  const quantity = qty ?? moq;
  const belowMoq = quantity < moq;
  // Preorders are limited by places and a per-order cap instead of stock on the shelf.
  const isPreorder = !!product.is_preorder;
  const preorderOpen = isPreorder && !!product.preorder_approved && product.preorder_status === 'open' && marketplace?.preorder_enabled !== false;
  const taken = preorderTaken?.get(product.id) ?? 0;
  const placesLeft = preorderOpen && product.preorder_quantity_limit != null ? Math.max(0, product.preorder_quantity_limit - taken) : null;
  const maxQuantity = isPreorder ? Math.min(product.preorder_max_per_order ?? Infinity, placesLeft ?? Infinity) : product.stock_quantity;
  const overStock = quantity > maxQuantity;
  const unitNow = unitPriceFor(product, quantity);
  const rows = tierRows(product);
  const activeRowIndex = rows.reduce((found, row, index) => (quantity >= row.from ? index : found), 0);
  const specs = parseSpecs(product.specs);
  const outOfStock = isPreorder ? (!preorderOpen || placesLeft === 0) : product.stock_quantity <= 0;
  const limitText = isPreorder ? `You can preorder up to ${maxQuantity} of this product in one order.` : `Only ${product.stock_quantity} available.`;
  const canBuy = !outOfStock && !belowMoq && !overStock;
  const similar = (recommendations ?? []).filter(item => item.id !== product.id).slice(0, 4);

  const cartPayload = {
    id: product.id, name: product.name, price: product.price, image_url: product.image_url, slug: product.slug,
    moq, unit, price_tiers: product.price_tiers,
    is_preorder: preorderOpen, preorder_release_date: product.preorder_release_date,
  };

  const validateQuantity = () => {
    if (belowMoq) { toast.error(`Minimum order is ${moq} ${pluralUnit(unit)}`); return false; }
    if (overStock) { toast.error(limitText); return false; }
    // Preorders and in-stock items are paid for in separate orders (the server enforces this too).
    if (cartItems.length > 0 && cartItems.some(i => !!i.is_preorder !== preorderOpen)) {
      toast.error('Preorder items must be ordered separately from in-stock items. Check out your current cart first.');
      return false;
    }
    return true;
  };

  const handleAddToCart = () => {
    if (!validateQuantity()) return;
    addItem(cartPayload, quantity);
    toast.success('Added to cart');
  };

  const handleBuyNow = () => {
    if (!validateQuantity()) return;
    addItem(cartPayload, quantity);
    navigate('/checkout');
  };

  // Pay later: shown for products the supplier marked eligible, when it is switched on and Klump is set up.
  const payLaterOffered = !isPreorder && !!product.bnpl_eligible && !!finance?.bnpl_enabled && !!KLUMP_PUBLIC_KEY && marketplace?.bnpl_section_visible !== false;
  const payLaterTotal = Math.round(unitNow * quantity * 1.075); // includes 7.5% VAT, same as checkout
  const payLaterFits = !!finance && payLaterTotal >= Number(finance.bnpl_min_order) && payLaterTotal <= Number(finance.bnpl_max_order);

  const handlePayLater = () => {
    if (!validateQuantity()) return;
    addItem(cartPayload, quantity);
    navigate('/checkout?pay=later');
  };

  const inquiryTarget: InquiryDialogTarget | null = vendor
    ? {
        vendorId: vendor.id,
        vendorUserId: vendor.user_id ?? null,
        vendorName: vendor.store_name,
        productId: product.id,
        productName: product.name,
        moq,
        unit,
      }
    : null;

  const handleAddToBasket = () => {
    if (!vendor) return;
    if (basket.has(product.id)) { navigate('/inquiries?tab=basket'); return; }
    basket.add({
      product_id: product.id, vendor_id: vendor.id, vendor_user_id: vendor.user_id ?? null, vendor_name: vendor.store_name,
      name: product.name, slug: product.slug, image_url: product.image_url, quantity: Math.max(quantity, moq), moq,
    });
    toast.success('Added to your inquiry basket');
  };

  const whatsappNumber = (vendor?.whatsapp_number || vendor?.phone || '').replace(/[^0-9]/g, '');

  return (
    <Layout>
      <div className="container max-w-[1280px] px-4 py-4 pb-28 sm:py-7 md:pb-7">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
          <Link to="/" className="shrink-0 hover:text-primary">Home</Link>
          <ChevronRight className="h-3 w-3 shrink-0" />
          <Link to="/products" className="shrink-0 hover:text-primary">Products</Link>
          {product.categories?.name && <><ChevronRight className="h-3 w-3 shrink-0" /><span className="truncate">{product.categories.name}</span></>}
        </nav>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-10">
          {/* Gallery */}
          <section className="min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-lg border border-border bg-white sm:aspect-[1.08/1]">
              {showVideo && product.video_url ? (
                <video src={product.video_url} controls autoPlay className="h-full w-full bg-black object-contain" />
              ) : (
                <img src={selectedImage} alt={product.name} className="h-full w-full object-contain p-3 sm:p-8" />
              )}
              {product.badge && <Badge className="absolute left-3 top-3 rounded-sm border-none bg-primary/10 text-primary">{product.badge}</Badge>}
            </div>
            {(gallery.length > 1 || product.video_url) && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {product.video_url && (
                  <button
                    type="button"
                    onClick={() => setShowVideo(true)}
                    aria-label="Play product video"
                    aria-pressed={showVideo}
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-md border bg-secondary sm:h-20 sm:w-20 ${showVideo ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                  >
                    <Play className="h-6 w-6 text-primary" />
                  </button>
                )}
                {gallery.map((image, index) => (
                  <button
                    type="button"
                    key={image}
                    onClick={() => { setActiveImage(index); setShowVideo(false); }}
                    aria-label={`View product image ${index + 1}`}
                    aria-pressed={!showVideo && activeImage === index}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-white p-1 sm:h-20 sm:w-20 ${!showVideo && activeImage === index ? 'border-primary ring-1 ring-primary' : 'border-border'}`}
                  >
                    <img src={image} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* Buy box */}
          <section className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {product.brand && <span className="font-medium text-foreground">{product.brand}</span>}
              {product.categories?.name && <span>{product.categories.name}</span>}
            </div>
            <h1 className="mt-2 font-heading text-2xl font-bold leading-tight sm:text-3xl">{product.name}</h1>
            {(preorderOpen || (payLaterOffered && payLaterFits)) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {preorderOpen && <PreorderBadge date={product.preorder_release_date} />}
                {payLaterOffered && payLaterFits && <PayLaterBadge />}
              </div>
            )}

            {vendor && (
              <Link to={`/shop/${vendor.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary">
                {vendor.is_approved && <BadgeCheck className="h-4 w-4 text-primary" aria-label="Verified supplier" />}
                <span className="underline-offset-2 hover:underline">{vendor.store_name}</span>
              </Link>
            )}

            {/* Tiered pricing */}
            <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-border bg-border" style={{ gridTemplateColumns: `repeat(${Math.min(rows.length, 3)}, minmax(0, 1fr))` }}>
              {rows.map((row, index) => (
                <div key={row.from} className={`bg-card p-3 ${index === activeRowIndex && rows.length > 1 ? 'ring-2 ring-inset ring-primary' : ''}`}>
                  <p className="font-heading text-lg font-bold sm:text-xl">{formatNaira(row.price)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatQtyRange(row, unit)}</p>
                </div>
              ))}
            </div>
            {product.compare_at_price && product.compare_at_price > product.price && rows.length === 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="line-through">{formatNaira(product.compare_at_price)}</span>{' '}
                <span className="font-semibold text-primary">Save {Math.round((1 - product.price / product.compare_at_price) * 100)}%</span>
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="text-muted-foreground">Min. order: <span className="font-medium text-foreground">{moq} {moq === 1 ? unit : pluralUnit(unit)}</span></span>
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${outOfStock ? 'bg-destructive' : 'bg-primary'}`} />
                <span className={outOfStock ? 'text-destructive' : 'text-primary'}>
                  {isPreorder ? (outOfStock ? 'Preorder unavailable' : 'Available to preorder') : outOfStock ? 'Currently unavailable' : `${product.stock_quantity} available`}
                </span>
              </span>
            </div>

            {isPreorder && (
              <div className="mt-5 border border-border bg-secondary/40 p-4 text-sm" role="region" aria-label="Preorder details">
                <p className="font-heading font-semibold">{preorderOpen ? 'This is a preorder' : 'Preorder'}</p>
                {!preorderOpen && (
                  <p className="mt-1 text-muted-foreground">
                    {product.preorder_status === 'ready' ? 'Preorders for this product have closed and it is being prepared for delivery.'
                      : product.preorder_status === 'closed' ? 'Preorders for this product are closed.'
                      : 'This preorder is not open yet.'}
                  </p>
                )}
                <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  <div><dt className="text-xs text-muted-foreground">Expected availability</dt><dd className="font-medium">{formatLongDate(product.preorder_release_date) || 'To be confirmed'}</dd></div>
                  {product.preorder_delivery_estimate && <div><dt className="text-xs text-muted-foreground">Estimated delivery</dt><dd className="font-medium">{formatLongDate(product.preorder_delivery_estimate)}</dd></div>}
                  {placesLeft !== null && <div><dt className="text-xs text-muted-foreground">Places left</dt><dd className="font-medium">{placesLeft} of {product.preorder_quantity_limit}</dd></div>}
                  {product.preorder_max_per_order != null && <div><dt className="text-xs text-muted-foreground">Limit per order</dt><dd className="font-medium">{product.preorder_max_per_order}</dd></div>}
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  You pay the full price now and the supplier delivers once it is available. Dates are estimates; you will be told if they change.
                  Read the <Link to="/preorder-policy" className="text-primary hover:underline">Preorder Policy</Link>. Pay later is not available for preorders.
                </p>
                {product.preorder_terms && <p className="mt-2 whitespace-pre-wrap border-l-2 border-primary pl-3 text-xs text-muted-foreground"><strong className="text-foreground">Seller's terms:</strong> {product.preorder_terms}</p>}
              </div>
            )}

            {/* Quantity */}
            <div className="mt-5 border-y border-border py-4">
              <p className="mb-2 text-sm font-medium">Quantity</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center">
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-r-none" disabled={quantity <= moq} onClick={() => setQty(Math.max(moq, quantity - 1))} aria-label="Decrease quantity">
                    <Minus className="h-4 w-4" />
                  </Button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={moq}
                    value={quantity}
                    onChange={e => setQty(Math.floor(Number(e.target.value)) || 0)}
                    onBlur={() => setQty(Math.max(quantity, moq))}
                    aria-label="Quantity"
                    className="h-10 w-20 border-y border-input bg-background text-center text-sm outline-none"
                  />
                  <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-l-none" onClick={() => setQty(quantity + 1)} aria-label="Increase quantity">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatNaira(unitNow)} x {quantity} = <span className="font-heading font-bold text-foreground">{formatNaira(unitNow * quantity)}</span>
                </p>
              </div>
              {belowMoq && <p className="mt-2 text-xs text-destructive">Minimum order is {moq} {pluralUnit(unit)}.</p>}
              {overStock && !outOfStock && <p className="mt-2 text-xs text-destructive">{limitText}</p>}
            </div>

            {/* Actions */}
            <div className="mt-5 hidden gap-2 md:grid md:grid-cols-2">
              <Button size="lg" className="h-12 font-semibold" disabled={!canBuy} onClick={handleBuyNow}>
                <CreditCard className="mr-2 h-4 w-4" /> {preorderOpen ? 'Preorder now' : 'Buy now'}
              </Button>
              <Button size="lg" variant="outline" className="h-12 font-semibold" disabled={!canBuy} onClick={handleAddToCart}>
                <ShoppingCart className="mr-2 h-4 w-4" /> Add to cart
              </Button>
              {vendor && (
                <>
                  <Button size="lg" variant="outline" className="h-12 font-semibold" onClick={() => setInquiryOpen(true)}>
                    <Send className="mr-2 h-4 w-4" /> Send inquiry
                  </Button>
                  <Button size="lg" variant="outline" className="h-12 font-semibold" onClick={() => handleInAppChat(vendor.user_id || '', product.id)}>
                    <MessageSquare className="mr-2 h-4 w-4" /> Chat now
                  </Button>
                </>
              )}
            </div>
            {payLaterOffered && (
              <div className="mt-2">
                <Button size="lg" variant="secondary" className="h-12 w-full font-semibold" disabled={!canBuy || !payLaterFits} onClick={handlePayLater}>
                  <Wallet className="mr-2 h-4 w-4" /> Buy now, pay later with Klump
                </Button>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {payLaterFits
                    ? 'Spread the cost in instalments. Klump checks your eligibility and shows your plan before you confirm.'
                    : `Pay later is available for orders from ${formatNaira(Number(finance?.bnpl_min_order ?? 0))} to ${formatNaira(Number(finance?.bnpl_max_order ?? 0))}.`}
                </p>
              </div>
            )}
            {vendor && (
              <button type="button" onClick={handleAddToBasket} className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
                <ClipboardList className="h-4 w-4" />
                {basket.has(product.id) ? 'In your inquiry basket - view basket' : 'Add to inquiry basket to compare suppliers'}
              </button>
            )}

            <div className="mt-5 grid grid-cols-3 gap-2 border-y border-border py-4">
              <DetailFact icon={<PackageCheck />} label="Availability" value={isPreorder ? (outOfStock ? 'Unavailable' : 'Preorder') : outOfStock ? 'Sold out' : 'In stock'} />
              <DetailFact icon={<CreditCard />} label="Payment" value={payLaterOffered ? 'Paystack / Pay later' : 'Paystack'} />
              <DetailFact icon={<ShieldCheck />} label="Supplier" value={vendor?.is_approved ? 'Verified' : 'Marketplace'} />
            </div>

            {vendor && (
              <div className="mt-5">
                <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Supplier information</p>
                <Link to={`/shop/${vendor.id}`} className="flex min-w-0 items-center gap-3 hover:text-primary">
                  {vendor.logo_url ? <img src={vendor.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10"><Store className="h-5 w-5 text-primary" /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{vendor.store_name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {vendor.is_approved ? 'Verified supplier' : 'IT Hub Africa seller'}
                      {vendor.location ? ` - ${vendor.location}` : ''}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
                {whatsappNumber && (
                  <a href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi, I'm interested in ${product.name}`)}`} target="_blank" rel="noopener noreferrer" className="mt-3 block">
                    <Button size="sm" variant="outline" className="w-full gap-1.5"><MessageCircle className="h-4 w-4" /> WhatsApp the supplier</Button>
                  </a>
                )}
              </div>
            )}
          </section>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Something wrong with this listing? <Link to={`/contact?type=listing_report&product=${product.id}`} className="text-primary hover:underline">Report it</Link>
          {vendor && <> or <Link to={`/contact?type=seller_report&vendor=${vendor.id}`} className="text-primary hover:underline">report the seller</Link></>}.
          See our <Link to="/returns-policy" className="text-primary hover:underline">returns policy</Link> and <Link to="/shipping-policy" className="text-primary hover:underline">shipping policy</Link>.
        </p>

        <section className="mt-8 border-y border-border py-5 sm:mt-10">
          <h2 className="font-heading text-lg font-bold">Product description</h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-7 text-muted-foreground">{product.description || 'Contact the seller for more information about this product.'}</p>
        </section>

        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="border-b border-border pb-5 sm:border-0">
            <h2 className="font-heading text-lg font-bold">Product attributes</h2>
            <dl className="mt-3 divide-y divide-border text-sm">
              {specs.map(([key, value]) => <DetailRow key={key} label={key} value={value} />)}
              {product.brand && <DetailRow label="Brand" value={product.brand} />}
              {product.categories?.name && <DetailRow label="Category" value={product.categories.name} />}
              {product.sku && <DetailRow label="SKU" value={product.sku} />}
              <DetailRow label="Minimum order" value={`${moq} ${moq === 1 ? unit : pluralUnit(unit)}`} />
              <DetailRow label="Availability" value={isPreorder ? (outOfStock ? 'Preorder unavailable' : `Preorder - expected ${formatLongDate(product.preorder_release_date) || 'date to be confirmed'}`) : outOfStock ? 'Out of stock' : `${product.stock_quantity} in stock`} />
            </dl>
          </div>
          <div>
            <h2 className="font-heading text-lg font-bold">Order information</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Delivery timing and shipping costs vary by supplier and destination. Send an inquiry or chat with the supplier to confirm a delivery estimate before ordering.
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Card, bank and transfer payments at checkout are processed securely by Paystack. Price breaks above are applied automatically to your quantity.
            </p>
          </div>
        </section>

        {!!similar.length && (
          <section className="mt-9 border-t border-border pt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <h2 className="font-heading text-lg font-bold sm:text-xl">Similar products</h2>
              {product.categories?.slug && <Link to={`/category/${product.categories.slug}`} className="text-sm font-medium text-primary">View category</Link>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {similar.map(item => <ProductCard key={item.id} {...item} />)}
            </div>
          </section>
        )}
      </div>

      {/* Mobile sticky action bar (sits above the bottom tab bar) */}
      <div className="fixed inset-x-0 bottom-14 z-40 border-t border-border bg-background/95 p-2 backdrop-blur md:hidden pb-2">
        <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
          {vendor && (
            <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => handleInAppChat(vendor.user_id || '', product.id)} aria-label="Chat now">
              <MessageSquare className="h-5 w-5" />
            </Button>
          )}
          {vendor ? (
            <Button variant="outline" className="h-11 font-semibold" onClick={() => setInquiryOpen(true)}>Send inquiry</Button>
          ) : (
            <Button variant="outline" className="h-11 font-semibold" disabled={!canBuy} onClick={handleAddToCart}>Add to cart</Button>
          )}
          <Button className="h-11 font-semibold" disabled={!canBuy} onClick={handleBuyNow}>{preorderOpen ? 'Preorder now' : 'Buy now'}</Button>
        </div>
      </div>

      <InquiryDialog open={inquiryOpen} onOpenChange={setInquiryOpen} target={inquiryTarget} defaultQuantity={quantity} />
    </Layout>
  );
}

function DetailFact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-primary [&_svg]:h-4 [&_svg]:w-4">{icon}<span className="truncate text-[10px] font-semibold uppercase text-muted-foreground">{label}</span></div>
      <p className="mt-1 truncate text-xs font-medium">{value}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-2.5"><dt className="text-muted-foreground">{label}</dt><dd className="text-right font-medium">{value}</dd></div>;
}
