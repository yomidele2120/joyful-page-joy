import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import ProductCard, { ProductCardSkeleton } from '@/components/ProductCard';
import { FeaturedAds } from '@/components/ads/HomepageAds';
import PlansSection from '@/components/plans/PlansSection';
import { useCategories, useMarketplaceStats, useProducts } from '@/hooks/useProducts';

// The front door for visitors who are not signed in. Signed-in users go straight to the marketplace home (see RootRoute).
// Everything shown is real data: product photos, categories and the verified-supplier count come from the database.

const SIGN = { fontFamily: '"Big Shoulders Display", "Space Grotesk", system-ui, sans-serif' } as const;

export default function Landing() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data: products, isLoading } = useProducts({ limit: 24 });
  const { data: categories } = useCategories();
  const { data: stats } = useMarketplaceStats();
  const crates = (products ?? []).filter(p => p.image_url).slice(0, 4);
  const picks = (products ?? []).slice(0, 8);

  useEffect(() => {
    const old = document.title;
    document.title = 'IT Hub Africa: buy from verified suppliers in Nigeria';
    return () => { document.title = old; };
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/products?search=${encodeURIComponent(term)}` : '/products');
  };

  return (
    <Layout>
      <section className="bg-[#0a2236] text-white">
        <div className="container max-w-[1200px] grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.15fr_1fr] lg:py-20">
          <div>
            <h1 style={SIGN} className="text-[3.2rem] font-extrabold uppercase leading-[0.92] sm:text-[4.8rem] lg:text-[5.8rem]">
              Buy from verified suppliers in Nigeria
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-white/75 sm:text-lg">
              Compare prices, ask for quotes and order in bulk or one at a time.
            </p>
            <form onSubmit={submit} role="search" className="mt-8 flex max-w-xl overflow-hidden rounded-md bg-white shadow-lg focus-within:ring-2 focus-within:ring-[#f26a1b]">
              <label htmlFor="landing-search" className="sr-only">Search products</label>
              <input id="landing-search" value={q} onChange={e => setQ(e.target.value)} placeholder="What do you need? e.g. laptops, fabric, rice"
                className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-base text-[#0a2236] placeholder:text-[#0a2236]/50 focus:outline-none" />
              <button type="submit" className="flex items-center gap-2 bg-[#f26a1b] px-5 text-base font-semibold text-white transition-colors hover:bg-[#d95c12]">
                <Search className="h-4 w-4" aria-hidden="true" /> Search
              </button>
            </form>
            <p className="mt-4 text-sm text-white/70">
              Or <Link to="/home" className="font-medium text-white underline underline-offset-4">enter the marketplace</Link>
              {stats?.vendorCount ? ` from ${stats.vendorCount} verified ${stats.vendorCount === 1 ? 'supplier' : 'suppliers'}` : ''}.
            </p>
          </div>
          {crates.length >= 2 && (
            <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2" aria-hidden="true">
              {crates.map((p, i) => (
                <div key={p.id} className={`overflow-hidden rounded-sm bg-white/10 ${i === 0 ? 'row-span-2 aspect-[3/4]' : 'aspect-square'}`}>
                  <img src={p.thumb_url || p.image_url!} alt="" loading={i < 2 ? 'eager' : 'lazy'} className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <FeaturedAds className="container max-w-[1200px] pt-6" />

      {!!categories?.length && (
        <section className="container max-w-[1200px] py-14 sm:py-20">
          <h2 style={SIGN} className="mb-8 text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">Shop by category</h2>
          <ul className="grid divide-y divide-border border-y border-border sm:grid-cols-2 sm:divide-y-0 sm:gap-x-12 lg:grid-cols-3">
            {categories.slice(0, 12).map(c => (
              <li key={c.id} className="sm:border-b sm:border-border sm:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:nth-last-child(-n+3)]:border-b-0">
                <Link to={`/category/${c.slug}`} className="flex items-center justify-between py-4 font-heading text-lg font-medium transition-colors hover:text-[#f26a1b]">
                  {c.name}<span aria-hidden="true" className="text-muted-foreground">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="bg-secondary/60 py-14 sm:py-20">
        <div className="container max-w-[1200px]">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">On the shelves now</h2>
            <Link to="/home" className="shrink-0 text-sm font-semibold text-primary hover:underline">Enter the marketplace</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {isLoading ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />) : picks.map(p => <ProductCard key={p.id} {...p} />)}
          </div>
        </div>
      </section>

      <PlansSection id="plans" />

      <section className="container max-w-[1200px] py-14 sm:py-20">
        <div className="grid gap-10 md:grid-cols-2">
          <div>
            <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">Can't find it? Ask for a quote</h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">Describe what you need and how much. Suppliers reply with their prices.</p>
            <Link to="/rfq/new" className="mt-6 inline-block rounded-md border border-foreground/30 px-5 py-2.5 font-semibold transition-colors hover:bg-foreground hover:text-background">Request a quote</Link>
          </div>
          <div>
            <h2 style={SIGN} className="text-4xl font-extrabold uppercase leading-[0.95] sm:text-5xl">Selling something?</h2>
            <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">Open a shop, list your products and get paid into your bank account. The free plan costs nothing.</p>
            <Link to="/sell" className="mt-6 inline-block rounded-md bg-[#f26a1b] px-5 py-2.5 font-semibold text-white transition-colors hover:bg-[#d95c12]">Sell on IT Hub Africa</Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
