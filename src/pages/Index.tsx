import { Link } from 'react-router-dom';
import { ArrowRight, PackageSearch, Send, ShieldCheck, Sparkles, Store, Truck } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import ProductCard from '@/components/ProductCard';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function Index() {
  const { data: products, isLoading } = useProducts({ limit: 30 });
  const { data: featured } = useProducts({ featured: true, limit: 8 });
  const { data: categories } = useCategories();

  return (
    <Layout>
      <div className="bg-secondary/60 border-b border-border/70">
        <div className="container flex items-center gap-5 overflow-x-auto py-3 scrollbar-hide">
          <Link to="/products" className="shrink-0 text-sm font-semibold text-foreground">All products</Link>
          {categories?.slice(0, 10).map(category => (
            <Link key={category.id} to={`/category/${category.slug}`} className="shrink-0 text-sm text-muted-foreground hover:text-primary transition-colors">
              {category.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="container max-w-[1440px] py-5 sm:py-8">
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
          <MarketAction icon={<PackageSearch />} title="Explore products" description="Browse the full marketplace" href="/products" />
          <MarketAction icon={<ShieldCheck />} title="Shop with confidence" description="See seller and stock details" href="/products" />
          <MarketAction icon={<Store />} title="Sell on MarketHub" description="Bring your business online" href="/supplier-signup" />
        </section>

        {!!featured?.length && (
          <section className="mt-8 sm:mt-10">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase text-primary">Picked for you</p>
                <h2 className="mt-1 font-heading text-xl font-bold sm:text-2xl">Featured products</h2>
              </div>
              <Link to="/products" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {featured.slice(0, 4).map(product => <ProductCard key={product.id} {...product} />)}
            </div>
          </section>
        )}

        <section className="mt-9 sm:mt-12">
          <div className="mb-3 flex items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Marketplace picks
              </div>
              <h1 className="mt-1 font-heading text-2xl font-bold sm:text-3xl">You may like</h1>
            </div>
            <Link to="/products" className="shrink-0 text-sm font-medium text-primary hover:underline">See all</Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
              {Array.from({ length: 10 }).map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-lg bg-secondary" />)}
            </div>
          ) : products?.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
              {products.map(product => <ProductCard key={product.id} {...product} />)}
            </div>
          ) : (
            <div className="border-y border-border py-14 text-center text-sm text-muted-foreground">
              Products will appear here as sellers add them.
            </div>
          )}
        </section>

        <section className="mt-8 flex flex-col gap-3 border-y border-border py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Truck className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">Find products from independent sellers across Nigeria.</p>
          </div>
          <Link to="/feed" className="text-sm font-semibold text-primary">Watch products in action <ArrowRight className="ml-1 inline h-4 w-4" /></Link>
        </section>
      </div>

      <section className="py-14 md:py-20 bg-foreground dark:bg-black text-background dark:text-white">
        <div className="container max-w-lg text-center">
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2 text-background dark:text-white">Stay Updated</h2>
          <p className="text-background/70 dark:text-white/70 text-sm md:text-base mb-7">
            Get the latest deals and product updates directly to your inbox.
          </p>
          <form className="flex gap-2" onSubmit={e => e.preventDefault()}>
            <Input
              placeholder="Enter your email"
              type="email"
              className="flex-1 bg-background/20 dark:bg-white/10 border-background/30 dark:border-white/20 text-background dark:text-white placeholder:text-background/50 dark:placeholder:text-white/50 h-11"
            />
            <Button type="submit" size="lg" className="shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground">
              <Send className="w-4 h-4 mr-1.5" /> Subscribe
            </Button>
          </form>
        </div>
      </section>
    </Layout>
  );
}

function MarketAction({ icon, title, description, href }: { icon: React.ReactNode; title: string; description: string; href: string }) {
  return (
    <Link to={href} className="flex min-w-0 items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-secondary/60 sm:px-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
