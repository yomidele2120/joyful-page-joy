import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { formatNaira } from '@/lib/format';
import { motion } from 'framer-motion';

interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  badge?: string | null;
  brand?: string | null;
  stock_quantity?: number;
}

export default function ProductCard({ name, slug, price, compare_at_price, image_url, badge, brand, stock_quantity }: ProductCardProps) {
  const discount = compare_at_price ? Math.round(((compare_at_price - price) / compare_at_price) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.3 }}
      className="group bg-card rounded-lg overflow-hidden h-full flex flex-col border border-border/70"
    >
      <Link to={`/product/${slug}`} className="block relative aspect-square overflow-hidden bg-white">
        <img
          src={image_url || '/placeholder.svg'}
          alt={name}
          className="w-full h-full object-contain p-2 sm:p-3 group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
        {badge && (
          <Badge className="absolute top-2 left-2 bg-primary/10 text-primary border-none text-[10px] px-2 py-0.5 rounded-sm">
            {badge}
          </Badge>
        )}
        {discount > 0 && (
          <span className="absolute bottom-2 left-2 bg-accent text-accent-foreground text-[10px] font-semibold px-2 py-0.5 rounded-sm">
            -{discount}%
          </span>
        )}
      </Link>

      <div className="px-2.5 pb-3 pt-2 flex flex-col flex-1 sm:px-3">
        <Link to={`/product/${slug}`} className="min-h-9">
          <h3 className="font-medium text-xs sm:text-sm leading-snug line-clamp-2 text-foreground group-hover:text-primary transition-colors">
            {name}
          </h3>
        </Link>
        <div className="flex flex-wrap items-baseline gap-x-1.5 mt-2">
          <span className="font-heading font-bold text-sm sm:text-base text-foreground">{formatNaira(price)}</span>
          {compare_at_price && (
            <span className="text-[10px] text-muted-foreground line-through">{formatNaira(compare_at_price)}</span>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] sm:text-xs text-muted-foreground">
          <span className="truncate">{brand || 'MarketHub seller'}</span>
          {typeof stock_quantity === 'number' && (
            <span className="shrink-0">{stock_quantity > 0 ? 'In stock' : 'Sold out'}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
