import { Link } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatNaira } from '@/lib/format';
import { formatMoq, priceRange } from '@/lib/pricing';
import type { Json } from '@/integrations/supabase/types';
import { motion } from 'framer-motion';

export interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  badge?: string | null;
  brand?: string | null;
  stock_quantity?: number;
  moq?: number | null;
  unit?: string | null;
  price_tiers?: Json | null;
  vendors?: { store_name: string; is_approved: boolean | null } | null;
}

export function ProductPrice({ product, className = '', compact = false }: { product: Pick<ProductCardProps, 'price' | 'price_tiers' | 'compare_at_price'>; className?: string; compact?: boolean }) {
  const { min, max } = priceRange({ price: product.price, price_tiers: product.price_tiers });
  const hasRange = max > min;
  return (
    <div className={`flex flex-wrap items-baseline gap-x-1.5 ${className}`}>
      <span className={`font-heading font-bold text-foreground ${compact ? 'text-[11px] leading-tight sm:text-base' : 'text-sm sm:text-base'}`}>
        {hasRange ? `${formatNaira(min)} - ${formatNaira(max)}` : formatNaira(min)}
      </span>
      {!hasRange && product.compare_at_price && (
        <span className={`text-muted-foreground line-through ${compact ? 'hidden text-[10px] sm:inline' : 'text-[10px]'}`}>{formatNaira(product.compare_at_price)}</span>
      )}
    </div>
  );
}

export default function ProductCard({
  name, slug, price, compare_at_price, image_url, badge, brand, stock_quantity, moq, unit, price_tiers, vendors,
}: ProductCardProps) {
  const hasTiers = Array.isArray(price_tiers) && price_tiers.length > 0;
  const discount = !hasTiers && compare_at_price ? Math.round(((compare_at_price - price) / compare_at_price) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.3 }}
      className="group bg-card rounded-none overflow-hidden h-full flex flex-col border border-border/70"
    >
      <Link to={`/product/${slug}`} className="block relative aspect-square overflow-hidden bg-white">
        <img
          src={image_url || '/placeholder.svg'}
          alt={name}
          className="w-full h-full object-contain p-1 sm:p-3 group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
        {badge && (
          <Badge className="absolute top-1 left-1 bg-primary/10 text-primary border-none text-[8px] px-1 py-0 sm:top-2 sm:left-2 sm:text-[10px] sm:px-2 sm:py-0.5 rounded-none">
            {badge}
          </Badge>
        )}
        {discount > 0 && (
          <span className="absolute bottom-1 left-1 bg-accent text-accent-foreground text-[8px] font-semibold px-1 py-0 sm:bottom-2 sm:left-2 sm:text-[10px] sm:px-2 sm:py-0.5 rounded-none">
            -{discount}%
          </span>
        )}
      </Link>

      <div className="px-1.5 pb-2 pt-1.5 flex flex-col flex-1 sm:px-3 sm:pb-3 sm:pt-2">
        <Link to={`/product/${slug}`} className="min-h-[26px] sm:min-h-9">
          <h3 className="font-medium text-[10px] leading-tight sm:text-sm sm:leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {name}
          </h3>
        </Link>
        <ProductPrice product={{ price, price_tiers, compare_at_price }} compact className="mt-1 sm:mt-2" />
        <p className="mt-0.5 hidden text-[11px] sm:block sm:text-xs text-muted-foreground">{formatMoq({ price, moq, unit })}</p>
        <div className="mt-1.5 hidden items-center justify-between gap-2 text-[10px] sm:flex sm:text-xs text-muted-foreground">
          <span className="flex min-w-0 items-center gap-1">
            {vendors?.is_approved && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified supplier" />}
            <span className="truncate">{vendors?.store_name || brand || 'IT Hub Africa seller'}</span>
          </span>
          {typeof stock_quantity === 'number' && stock_quantity <= 0 && <span className="shrink-0 text-destructive">Sold out</span>}
        </div>
        {typeof stock_quantity === 'number' && stock_quantity <= 0 && <p className="mt-0.5 text-[9px] text-destructive sm:hidden">Sold out</p>}
      </div>
    </motion.div>
  );
}
