import { useParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { useProducts } from '@/hooks/useProducts';

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: products, isLoading } = useProducts({ categorySlug: slug });

  const title = slug?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Category';

  return (
    <Layout>
      <div className="container py-8">
        <h1 className="font-heading text-3xl font-bold mb-6">{title}</h1>
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-card rounded-lg animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">{products?.length || 0} products</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {products?.map(p => <ProductCard key={p.id} {...p} />)}
            </div>
            {!products?.length && (
              <p className="text-center text-muted-foreground py-12">No products found in this category.</p>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
