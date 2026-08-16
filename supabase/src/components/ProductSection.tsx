import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import ProductCard from './ProductCard';
import { cn } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  compare_at_price?: number | null;
  image_url?: string | null;
  badge?: string | null;
  brand?: string | null;
}

interface ProductSectionProps {
  title: string;
  eyebrow?: string;
  products: Product[];
  linkTo?: string;
  tinted?: boolean;
}

export default function ProductSection({ title, eyebrow, products, linkTo, tinted }: ProductSectionProps) {
  if (!products?.length) return null;

  return (
    <section className={cn('py-10 md:py-12', tinted && 'bg-secondary/40 border-y border-border')}>
      <div className="container">
        <div className="flex items-end justify-between mb-5">
          <div>
            {eyebrow && <span className="text-xs font-semibold tracking-wide text-primary uppercase">{eyebrow}</span>}
            <h2 className="font-heading text-xl md:text-2xl font-bold text-foreground mt-0.5">{title}</h2>
          </div>
          {linkTo && (
            <Link to={linkTo} className="flex items-center gap-1 text-sm text-primary hover:underline underline-offset-4 font-medium shrink-0">
              Shop all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
          {products.map(p => (
            <ProductCard key={p.id} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
