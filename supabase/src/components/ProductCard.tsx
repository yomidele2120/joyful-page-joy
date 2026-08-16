import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
}

export default function ProductCard({ id, name, slug, price, compare_at_price, image_url, badge, brand }: ProductCardProps) {
  const discount = compare_at_price ? Math.round(((compare_at_price - price) / compare_at_price) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-30px" }}
      transition={{ duration: 0.3 }}
      className="group bg-card rounded-xl overflow-hidden h-full flex flex-col"
    >
      <Link to={`/product/${slug}`} className="block relative aspect-square overflow-hidden bg-secondary/50 rounded-xl m-1.5">
        <img
          src={image_url || '/placeholder.svg'}
          alt={name}
          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {/* Heart button top-right */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-1 w-7 h-7 rounded-full bg-card/80 backdrop-blur-sm hover:bg-card shadow-sm"
          onClick={(e) => e.preventDefault()}
        >
          <Heart className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
        {badge && (
          <Badge className="absolute top-1 left-1 bg-accent text-accent-foreground border-none text-[8px] px-1.5 py-0.5 rounded-full">
            {badge}
          </Badge>
        )}
        {discount > 0 && (
          <span className="absolute bottom-1 left-1 bg-destructive text-destructive-foreground text-[8px] font-semibold px-1.5 py-0.5 rounded-full">
            -{discount}%
          </span>
        )}
      </Link>

      <div className="px-2 pb-2 pt-1 flex flex-col flex-1">
        <div className="flex items-baseline gap-1">
          <span className="font-heading font-bold text-xs text-foreground">{formatNaira(price)}</span>
          {compare_at_price && (
            <span className="text-[9px] text-muted-foreground line-through">{formatNaira(compare_at_price)}</span>
          )}
        </div>
        <Link to={`/product/${slug}`}>
          <h3 className="font-medium text-[11px] leading-tight mt-0.5 line-clamp-2 text-muted-foreground group-hover:text-foreground transition-colors">
            {name}
          </h3>
        </Link>
        {brand && <span className="text-[9px] text-muted-foreground/70 mt-0.5 truncate block">{brand}</span>}
      </div>
    </motion.div>
  );
}
