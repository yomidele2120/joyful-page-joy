import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchProduct } from '@/hooks/useProducts';
import { BadgeCheck, ImageOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatNaira } from '@/lib/format';
import { formatMoq, priceRange } from '@/lib/pricing';
import type { Json } from '@/integrations/supabase/types';
import { PayLaterBadge, PreorderBadge } from '@/components/ProductBadges';
import { bnplEligibleForPrice, usePayLaterAvailable, usePublicFinance } from '@/hooks/useMarketplace';

export interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  /** Small copy of the photo (about 400 px). Cards show this when there is one. */
  thumb_url?: string | null;
  badge?: string | null;
  brand?: string | null;
  stock_quantity?: number;
  moq?: number | null;
  unit?: string | null;
  price_tiers?: Json | null;
  vendors?: { store_name: string; is_approved: boolean | null } | null;
  bnpl_eligible?: boolean | null;
  is_preorder?: boolean | null;
  preorder_approved?: boolean | null;
  preorder_release_date?: string | null;
}

export function ProductPrice({ product, className = '', compact = false }: { product: Pick<ProductCardProps, 'price' | 'price_tiers' | 'compare_at_price'>; className?: string; compact?: boolean }) {
  const { min, max } = priceRange({ price: product.price, price_tiers: product.price_tiers });
  const hasRange = max > min;
  return (
    <div className={`flex flex-wrap items-baseline gap-x-1.5 ${className}`}>
      <span className={`font-heading font-bold tabular-nums text-foreground ${compact ? 'text-sm leading-tight sm:text-base' : 'text-base'}`}>
        {hasRange ? `${formatNaira(min)} - ${formatNaira(max)}` : formatNaira(min)}
      </span>
      {!hasRange && product.compare_at_price && (
        <span className={`text-muted-foreground line-through text-xs`}>{formatNaira(product.compare_at_price)}</span>
      )}
    </div>
  );
}

export default function ProductCard({
  name, slug, price, compare_at_price, image_url, thumb_url, badge, brand, stock_quantity, moq, unit, price_tiers, vendors,
  bnpl_eligible, is_preorder, preorder_approved, preorder_release_date,
}: ProductCardProps) {
  // Pay later is only advertised when it is genuinely on and this product fits the limits; preorders never offer it.
  const { data: finance } = usePublicFinance();
  const payLaterAvailable = usePayLaterAvailable();
  const showPreorder = !!is_preorder && !!preorder_approved;
  const showPayLater = !showPreorder && bnplEligibleForPrice({ bnpl_eligible, price, moq }, finance, payLaterAvailable);
  const queryClient = useQueryClient();
  // Start loading the product page as soon as someone shows interest, so opening it feels instant.
  const warm = () => prefetchProduct(queryClient, slug);
  const hasTiers = Array.isArray(price_tiers) && price_tiers.length > 0;
  const discount = !hasTiers && compare_at_price ? Math.round(((compare_at_price - price) / compare_at_price) * 100) : 0;

  const soldOut = typeof stock_quantity === 'number' && stock_quantity <= 0;
  const seller = vendors?.store_name || brand || 'IT Hub Africa seller';

  // Photo states: a soft shimmer while it loads, then it fades in. If the small copy fails we try the full photo,
  // and if that fails too (or there is no photo) we show a tidy placeholder instead of a broken or blank box.
  const [src, setSrc] = useState<string | null>(thumb_url || image_url || null);
  const [loaded, setLoaded] = useState(false);
  const onImageError = () => {
    if (src && src === thumb_url && image_url && image_url !== thumb_url) setSrc(image_url);
    else setSrc(null);
  };

  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/50 transition-shadow duration-200 animate-fade-in hover:shadow-lg">
      <Link to={`/product/${slug}`} className="relative m-1.5 block aspect-square overflow-hidden rounded-xl bg-white" onPointerEnter={warm} onFocus={warm} onTouchStart={warm}>
        {src ? (
          <>
            {!loaded && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-secondary/60" />}
            <img
              src={src}
              alt={name}
              decoding="async"
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={onImageError}
              className={`h-full w-full object-contain p-2 transition-[opacity,transform] duration-300 group-hover:scale-[1.04] sm:p-3 ${loaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-secondary text-muted-foreground">
            <ImageOff className="h-6 w-6" aria-hidden="true" />
            <span className="text-[11px]">No photo yet</span>
          </span>
        )}
        {badge && (
          <Badge className="absolute left-1.5 top-1.5 rounded-full border-none bg-background/90 px-2 py-0.5 text-[11px] font-medium text-primary shadow-sm">
            {badge}
          </Badge>
        )}
        {discount > 0 && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            -{discount}%
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col px-2.5 pb-3 pt-1 sm:px-3">
        <Link to={`/product/${slug}`} className="min-h-[2.5rem]" onPointerEnter={warm} onFocus={warm} onTouchStart={warm}>
          <h3 className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground transition-colors group-hover:text-primary sm:text-sm">
            {name}
          </h3>
        </Link>
        <ProductPrice product={{ price, price_tiers, compare_at_price }} className="mt-1.5" />
        {/* MOQ and seller are the two facts a B2B buyer needs, so they show on phones too */}
        <p className="mt-0.5 text-xs text-muted-foreground">{formatMoq({ price, moq, unit })}</p>
        {(showPreorder || showPayLater) && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {showPreorder && <PreorderBadge date={preorder_release_date} />}
            {showPayLater && <PayLaterBadge />}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            {vendors?.is_approved && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified supplier" />}
            <span className="truncate">{seller}</span>
          </span>
          {soldOut && <span className="shrink-0 font-medium text-destructive">Sold out</span>}
        </div>
      </div>
    </div>
  );
}

/** Grey placeholder shaped like a product card, shown while a list is loading. */
export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/50" aria-hidden="true">
      <div className="m-1.5 aspect-square animate-pulse rounded-xl bg-secondary" />
      <div className="space-y-2 px-2.5 pb-3 pt-1">
        <div className="h-3 w-4/5 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-3/5 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-2/5 animate-pulse rounded bg-secondary" />
      </div>
    </div>
  );
}
