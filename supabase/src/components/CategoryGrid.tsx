import { Link } from 'react-router-dom';
import { useCategories } from '@/hooks/useProducts';
import { Laptop, Monitor, Printer, Smartphone, Gamepad2, Headphones, Cpu, Battery, Camera, Watch, Tv, Tag, Tablet, Package, Shirt, Home, HeartPulse, ShoppingBasket, Baby, Dumbbell, BookOpen, Sparkles, Car, PawPrint, Gem } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const iconMap: Record<string, React.ReactNode> = {
  'laptops-computers': <Laptop className="w-full h-full" />,
  'desktop-computers': <Cpu className="w-full h-full" />,
  'phones': <Smartphone className="w-full h-full" />,
  'phones-accessories': <Smartphone className="w-full h-full" />,
  'printers': <Printer className="w-full h-full" />,
  'monitors': <Monitor className="w-full h-full" />,
  'accessories': <Headphones className="w-full h-full" />,
  'smartphones': <Smartphone className="w-full h-full" />,
  'tablets-ereaders': <Tablet className="w-full h-full" />,
  'gaming-devices': <Gamepad2 className="w-full h-full" />,
  'electronics': <Package className="w-full h-full" />,
  'deals-refurbished': <Tag className="w-full h-full" />,
  'power-banks-chargers': <Battery className="w-full h-full" />,
  'cameras-drones': <Camera className="w-full h-full" />,
  'wearables': <Watch className="w-full h-full" />,
  'smart-tvs': <Tv className="w-full h-full" />,
  'fashion': <Shirt className="w-full h-full" />,
  'clothing': <Shirt className="w-full h-full" />,
  'home-living': <Home className="w-full h-full" />,
  'home-kitchen': <Home className="w-full h-full" />,
  'beauty-health': <HeartPulse className="w-full h-full" />,
  'health-beauty': <HeartPulse className="w-full h-full" />,
  'groceries': <ShoppingBasket className="w-full h-full" />,
  'food-groceries': <ShoppingBasket className="w-full h-full" />,
  'baby-kids': <Baby className="w-full h-full" />,
  'sports-outdoors': <Dumbbell className="w-full h-full" />,
  'books-stationery': <BookOpen className="w-full h-full" />,
  'beauty': <Sparkles className="w-full h-full" />,
  'automotive': <Car className="w-full h-full" />,
  'pets': <PawPrint className="w-full h-full" />,
  'jewelry-accessories': <Gem className="w-full h-full" />,
};

// A muted-tone rotation so icon-only tiles (no category image set yet)
// still read as distinct "collections" rather than identical gray boxes.
const tints = [
  'from-primary/25 to-primary/5 text-primary',
  'from-accent/25 to-accent/5 text-accent',
  'from-foreground/15 to-foreground/5 text-foreground',
];

export default function CategoryGrid() {
  const { data: categories } = useCategories();

  if (!categories?.length) return null;

  // First two categories get large "featured collection" tiles, like a
  // Shopify homepage's lead collections; the rest fill out a denser grid.
  const [first, second, ...rest] = categories;

  return (
    <section className="py-12 md:py-16">
      <div className="container">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Collections</span>
            <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground mt-1">Shop by Category</h2>
          </div>
          <Link to="/products" className="hidden sm:block text-sm font-medium text-primary hover:underline underline-offset-4">
            Browse all
          </Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {first && <CategoryTile category={first} tint={tints[0]} className="col-span-2 md:col-span-2 aspect-[16/10] md:aspect-[16/9]" featured />}
          {second && <CategoryTile category={second} tint={tints[1]} className="col-span-2 md:col-span-2 aspect-[16/10] md:aspect-[16/9]" featured />}
          {rest.map((cat, i) => (
            <CategoryTile key={cat.id} category={cat} tint={tints[(i + 2) % tints.length]} className="aspect-square" />
          ))}
        </div>
      </div>
    </section>
  );
}

interface CategoryTileProps {
  category: { id: string; slug: string; name: string; image_url: string | null };
  tint: string;
  className?: string;
  featured?: boolean;
}

function CategoryTile({ category, tint, className, featured }: CategoryTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3 }}
      className={className}
    >
      <Link
        to={`/category/${category.slug}`}
        className="group relative block h-full w-full rounded-2xl overflow-hidden bg-card border border-border"
      >
        {category.image_url ? (
          <img
            src={category.image_url}
            alt={category.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={cn('absolute inset-0 bg-gradient-to-br flex items-center justify-center', tint)}>
            <div className={cn('opacity-40', featured ? 'w-16 h-16' : 'w-9 h-9')}>
              {iconMap[category.slug] || <Package className="w-full h-full" />}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <span
          className={cn(
            'absolute left-3 bottom-3 right-3 font-heading font-semibold text-white drop-shadow',
            featured ? 'text-lg md:text-xl' : 'text-xs md:text-sm line-clamp-2'
          )}
        >
          {category.name}
        </span>
      </Link>
    </motion.div>
  );
}
