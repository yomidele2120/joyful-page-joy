import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { useProducts, useCategories } from '@/hooks/useProducts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, SlidersHorizontal, X } from 'lucide-react';

export default function Products() {
  const [searchParams] = useSearchParams();
  const searchFromUrl = searchParams.get('search') || '';
  const [search, setSearch] = useState(searchFromUrl);
  const [sortBy, setSortBy] = useState('newest');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const { data: products, isLoading } = useProducts({ search: search || undefined });
  const { data: categories } = useCategories();

  const filtered = products
    ?.filter(p => selectedCategory === 'all' || p.category_id === selectedCategory)
    ?.sort((a, b) => {
      if (sortBy === 'price-low') return a.price - b.price;
      if (sortBy === 'price-high') return b.price - a.price;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <Layout>
      <div className="container max-w-[1440px] py-5 sm:py-8">
        <div className="mb-5 border-b border-border pb-4">
          <p className="text-xs font-semibold uppercase text-primary">MarketHub marketplace</p>
          <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">Browse available products from independent sellers.</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 border-r border-border pr-4">
              <h2 className="mb-3 text-sm font-semibold">Categories</h2>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`mb-1 block w-full rounded-md px-2.5 py-2 text-left text-sm ${selectedCategory === 'all' ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
              >
                All categories
              </button>
              <div className="max-h-[55vh] overflow-y-auto">
                {categories?.map(category => (
                  <button
                    type="button"
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`mb-1 block w-full rounded-md px-2.5 py-2 text-left text-sm ${selectedCategory === category.id ? 'bg-primary/10 font-semibold text-primary' : 'text-muted-foreground hover:bg-secondary'}`}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search products"
                  aria-label="Search products"
                  className="h-10 rounded-full bg-card pl-10 pr-10"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {!!search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="h-10 bg-card">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="price-low">Price: low to high</SelectItem>
                  <SelectItem value="price-high">Price: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {isLoading ? 'Loading products...' : `${filtered?.length || 0} products`}
                {selectedCategory !== 'all' && categories?.find(category => category.id === selectedCategory) && ` in ${categories.find(category => category.id === selectedCategory)?.name}`}
              </p>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-8 w-[170px] bg-card text-xs lg:hidden">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories?.map(category => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                {Array.from({ length: 10 }).map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-lg bg-secondary" />)}
              </div>
            ) : filtered?.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 sm:gap-3">
                {filtered.map(product => <ProductCard key={product.id} {...product} />)}
              </div>
            ) : (
              <div className="border-y border-border py-16 text-center">
                <p className="font-semibold">No products found</p>
                <p className="mt-1 text-sm text-muted-foreground">Try another search or category.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
