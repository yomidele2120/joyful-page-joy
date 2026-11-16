import { useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import ProductPager from '@/components/ProductPager';
import { usePagedProducts } from '@/hooks/usePagedProducts';
import { formatProductCount } from '@/lib/productSearch';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  // The page number lives in the address (?page=N), so a refresh, the back button and a shared link keep the same page.
  const page = Math.max(1, Math.min(10000, parseInt(searchParams.get('page') ?? '1', 10) || 1));
  const setPage = (n: number) => {
    const params = new URLSearchParams(searchParams);
    if (n > 1) params.set('page', String(n)); else params.delete('page');
    setSearchParams(params, { replace: n === 1 });
  };
  // A different category starts at page 1; a refresh of the same category keeps its page.
  const lastSlug = useRef(slug);
  useEffect(() => {
    if (lastSlug.current === slug) return;
    lastSlug.current = slug;
    if (searchParams.has('page')) setPage(1);
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // One page at a time from the database (a category can hold hundreds of thousands of products).
  const { data, isLoading, unknownCategory } = usePagedProducts({ page, categorySlug: slug });
  const products = data?.items ?? [];
  const total = data?.total ?? 0;

  const title = slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Category';

  return (
    <Layout>
      <div className="container py-8">
        <h1 className="mb-1 font-heading text-2xl font-bold sm:text-3xl">{title}</h1>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-card" />
            ))}
          </div>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">{formatProductCount(total)} products</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
