import { Link } from 'react-router-dom';
import { ShoppingCart, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCart } from '@/contexts/CartContext';
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
  const { addItem } = useCart();
  const discount = compare_at_price ? Math.round(((compare_at_price - price) / compare_at_price) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.35 }}
      className="group bg-card rounded-md overflow-hidden card-shadow hover:card-hover-shadow transition-all duration-300 h-full flex flex-col"
    >
      <Link to={`/product/${slug}`} className="block relative aspect-square overflow-hidden bg-secondary">
        <img
          src={image_url || '/placeholder.svg'}
          alt={name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />
        {badge && (
          <Badge className="absolute top-1 left-1 bg-accent text-accent-foreground border-none text-[8px] px-1 py-0">
            {badge}
          </Badge>
        )}
        {discount > 0 && (
          <Badge className="absolute top-1 right-1 bg-destructive text-destructive-foreground border-none text-[8px] px-1 py-0">
            -{discount}%
          </Badge>
        )}
      </Link>

      <div className="p-1.5 flex flex-col flex-1">
        {brand && <span className="text-[8px] text-muted-foreground uppercase tracking-wider truncate block">{brand}</span>}
        <Link to={`/product/${slug}`}>
          <h3 className="font-heading font-semibold text-[11px] leading-tight mt-0.5 line-clamp-2 text-card-foreground group-hover:text-primary transition-colors break-words">
            {name}
          </h3>
        </Link>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="font-heading font-bold text-xs text-primary">{formatNaira(price)}</span>
          {compare_at_price && (
            <span className="text-[8px] text-muted-foreground line-through">{formatNaira(compare_at_price)}</span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-1.5 mt-auto">
          <Button
            size="sm"
            className="flex-1 text-[9px] h-6 px-1.5"
            onClick={(e) => {
              e.preventDefault();
              addItem({ id, name, price, image_url: image_url || null, slug });
            }}
          >
            <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />
            Add
          </Button>
          <Button variant="outline" size="icon" className="shrink-0 h-6 w-6">
            <Heart className="w-2.5 h-2.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
