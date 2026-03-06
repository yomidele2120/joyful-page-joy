import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import ProductCard from './ProductCard';

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
  products: Product[];
  linkTo?: string;
}

export default function ProductSection({ title, products, linkTo }: ProductSectionProps) {
  if (!products?.length) return null;

  return (
    <section className="py-5">
      <div className="container">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-bold text-foreground">{title}</h2>
          {linkTo && (
            <Link to={linkTo} className="flex items-center gap-0.5 text-xs text-primary hover:underline font-medium">
              View All <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {products.map(p => (
            <ProductCard key={p.id} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
