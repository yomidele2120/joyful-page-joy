import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import ProductPager from '@/components/ProductPager';
import { usePagedProducts } from '@/hooks/usePagedProducts';
import { formatProductCount } from '@/lib/productSearch';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [slug]);

  // One page at a time from the database (a category can hold hundreds of thousands of products).
  const { data, isLoading, unknownCategory } = usePagedProducts({ page, categorySlug: slug });
  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  const title = slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Category';

  return (
    <Layout>
      <div className="container py-8">
        <h1 className="font-heading text-3xl font-bold mb-6">{title}</h1>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card rounded-lg animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">{formatProductCount(total)} products</p>
            <div className="grid grid-cols-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-1.5 sm:gap-3">
              {products.map(p => <ProductCard key={p.id} {...p} />)}
            </div>
            {(!products.length || unknownCategory) && (
              <p className="text-center text-muted-foreground py-12">No products found in this category.</p>
            )}
            <ProductPager
              page={Math.min(page, data?.pageCount ?? 1)} pageCount={data?.pageCount ?? 1} capped={data?.capped}
              onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
