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
    <section className="py-8">
      <div className="container">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-2xl font-bold text-foreground">{title}</h2>
          {linkTo && (
            <Link to={linkTo} className="flex items-center gap-1 text-sm text-primary hover:underline font-medium">
              View All <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {products.map(p => (
            <ProductCard key={p.id} {...p} />
          ))}
        </div>
      </div>
    </section>
  );
}
