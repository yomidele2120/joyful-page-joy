import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, PackageSearch, Send, Store } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import HeroCarousel from '@/components/HeroCarousel';
import TrustStrip from '@/components/TrustStrip';
import ScrollRow, { ScrollItem } from '@/components/ScrollRow';
import SupplierCard from '@/components/SupplierCard';
import ProductCard from '@/components/ProductCard';
import { useProducts, useSuppliers } from '@/hooks/useProducts';
import { getMoq } from '@/lib/pricing';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const FEED_PAGE = 20;

export default function Index() {
  const { isVendor } = useAuth();
  const { data: products, isLoading } = useProducts({ limit: 120 });
  const { data: featured } = useProducts({ featured: true, limit: 12 });
  const { data: lowMoq } = useProducts({ maxMoq: 5, limit: 12 });
  const { data: suppliers } = useSuppliers({ limit: 10 });
  const [visible, setVisible] = useState(FEED_PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const deals = useMemo(
    () => (products ?? []).filter(p => p.compare_at_price && p.compare_at_price > p.price).slice(0, 12),
    [products],
  );
  const newest = (products ?? []).slice(0, 12);
  const feed = products ?? [];

  // Endless feed: reveal more cards as the sentinel scrolls into view.
  useEffect(() => {
    const node = sentinel.current;
    if (!node || visible >= feed.length) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) setVisible(v => v + FEED_PAGE);
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible, feed.length]);

  return (
    <Layout>
      <HeroCarousel />
      <TrustStrip />

      <div className="container max-w-[1440px] pb-6">
        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <ActionTile to="/rfq/new" icon={<FileText />} title="Post RFQ" text="Request a quotation" />
          <ActionTile to="/products?tab=suppliers" icon={<Store />} title="Suppliers" text="Browse verified sellers" />
          <ActionTile to="/products" icon={<PackageSearch />} title="Products" text="Explore the marketplace" />
          {isVendor ? (
            <ActionTile to="/supplier-dashboard" icon={<Store />} title="Seller dashboard" text="Manage your store" />
          ) : (
            <ActionTile to="/supplier-signup" icon={<Store />} title="Sell on MarketHub" text="Open your store" />
          )}
        </section>

        {!!suppliers?.length && (
          <ScrollRow eyebrow="Trusted sellers" title="Verified suppliers" linkTo="/products?tab=suppliers">
            {suppliers.map(s => <ScrollItem key={s.id} wide><SupplierCard supplier={s} /></ScrollItem>)}
          </ScrollRow>
        )}

        {!!lowMoq?.length && (products ?? []).some(p => getMoq(p) > 5) && (
          <ScrollRow eyebrow="Start small" title="Low MOQ" linkTo="/products">
            {lowMoq.map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
          </ScrollRow>
        )}

        {!!featured?.length && (
          <ScrollRow eyebrow="Picked for you" title="Featured products" linkTo="/products">
            {featured.map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
          </ScrollRow>
        )}

        {!!deals.length && (
          <ScrollRow eyebrow="Price drops" title="Best deals" linkTo="/products">
            {deals.map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
          </ScrollRow>
        )}

        {!!newest.length && (
          <ScrollRow eyebrow="Just in" title="New arrivals" linkTo="/products">
            {newest.map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
          </ScrollRow>
        )}

        <section className="mt-9 sm:mt-12">
          <h2 className="mb-3 font-heading text-xl font-bold sm:text-2xl">You may like</h2>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
              {Array.from({ length: 10 }).map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse rounded-lg bg-secondary" />)}
            </div>
          ) : feed.length ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
                {feed.slice(0, visible).map(product => <ProductCard key={product.id} {...product} />)}
              </div>
              <div ref={sentinel} className="h-10" aria-hidden="true" />
              {visible < feed.length && (
                <div className="text-center">
                  <Button variant="outline" onClick={() => setVisible(v => v + FEED_PAGE)}>Load more</Button>
                </div>
              )}
            </>
          ) : (
            <div className="border-y border-border py-14 text-center text-sm text-muted-foreground">
              Products will appear here as sellers add them.
            </div>
          )}
          <div className="mt-6 text-center">
            <Link to="/products" className="text-sm font-semibold text-primary hover:underline">Browse all products</Link>
          </div>
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

function ActionTile({ to, icon, title, text }: { to: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <Link to={to} className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:bg-secondary/60 sm:px-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}
