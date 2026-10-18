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
import { bnplEligibleForPrice, useMarketplaceSettings, usePayLaterAvailable, usePublicFinance } from '@/hooks/useMarketplace';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FlyerBanner, FlyerCard, pickImages } from '@/components/flyers/Flyers';
import { FLYERS } from '@/lib/flyers';
import { useFlyers } from '@/hooks/useFlyers';
import { ImageFlyerBanner, ImageFlyerFill } from '@/components/flyers/ImageFlyers';
import { BrandFlyerBanner, BrandFlyerFill } from '@/components/flyers/BrandFlyerImage';
import { BRAND_FLYERS } from '@/lib/brandFlyers';

const FEED_PAGE = 20;

export default function Index() {
  const { isVendor } = useAuth();
  const { data: products, isLoading } = useProducts({ limit: 120 });
  const { data: featured } = useProducts({ featured: true, limit: 12 });
  const { data: lowMoq } = useProducts({ maxMoq: 5, limit: 12 });
  const { data: suppliers } = useSuppliers({ limit: 10 });
  const { data: bnplProducts } = useProducts({ bnplOnly: true, limit: 24 });
  const { data: preorderProducts } = useProducts({ preorderOnly: true, limit: 12 });
  const { data: finance } = usePublicFinance();
  const payLaterOn = usePayLaterAvailable();
  const { data: marketplace } = useMarketplaceSettings();
  // Only products that really qualify for Pay later right now are advertised.
  const payLaterRow = useMemo(
    () => (bnplProducts ?? []).filter(p => bnplEligibleForPrice(p, finance, payLaterOn)).slice(0, 12),
    [bnplProducts, finance, payLaterOn],
  );
  const [visible, setVisible] = useState(FEED_PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  const deals = useMemo(
    () => (products ?? []).filter(p => p.compare_at_price && p.compare_at_price > p.price).slice(0, 12),
    [products],
  );
  const newest = (products ?? []).slice(0, 12);
  const feed = products ?? [];

  // Product photos used as flyer artwork (real data only).
  const photos = useMemo(
    () => (products ?? []).map(p => p.image_url).filter((u): u is string => !!u),
    [products],
  );
  const art = (offset: number, count = 3) => pickImages(photos, offset, count);

  // Flyers the admin uploaded. Each spot below uses an uploaded one when there
  // is one for it, and the built-in flyer otherwise.
  const { ready: flyersReady, forPlacement } = useFlyers();
  const rowBanners = forPlacement('row_banner');
  const hasUploadedRows = rowBanners.length > 0;
  const feedBanners = forPlacement('feed_banner');
  const feedCards = forPlacement('feed_card');

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
      <HeroCarousel images={photos} />
      <TrustStrip />

      <div className="container max-w-[1440px] pb-6">
        <section className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <ActionTile to="/rfq/new" icon={<FileText />} title="Post RFQ" text="Request a quotation" />
          <ActionTile to="/products?tab=suppliers" icon={<Store />} title="Suppliers" text="Browse verified sellers" />
          <ActionTile to="/products" icon={<PackageSearch />} title="Products" text="Explore the marketplace" />
          {isVendor ? (
            <ActionTile to="/supplier-dashboard" icon={<Store />} title="Seller dashboard" text="Manage your store" />
          ) : (
            <ActionTile to="/supplier-signup" icon={<Store />} title="Sell on IT Hub Africa" text="Open your store" />
          )}
        </section>

        {!!suppliers?.length && (
          <ScrollRow eyebrow="Trusted sellers" title="Verified suppliers" linkTo="/products?tab=suppliers">
            {suppliers.map(s => <ScrollItem key={s.id} wide><SupplierCard supplier={s} /></ScrollItem>)}
          </ScrollRow>
        )}

        {/* Flyer: "Seamless payment" banner between the suppliers row and the product rows */}
        {flyersReady && (rowBanners[0]
          ? <ImageFlyerBanner className="mt-8 sm:mt-10" flyer={rowBanners[0]} />
          : hasUploadedRows ? null : <BrandFlyerBanner className="mt-8 sm:mt-10" flyer={BRAND_FLYERS.seamlessPurple} />)}

        {payLaterOn && !!payLaterRow.length && (
          <ScrollRow eyebrow="Buy now, pay later" title="Pay later with Klump" linkTo="/pay-later">
            {payLaterRow.map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
          </ScrollRow>
        )}

        {marketplace?.preorder_enabled !== false && !!preorderProducts?.length && (
          <ScrollRow eyebrow="Order ahead" title="Preorders" linkTo="/preorders">
            {preorderProducts.map(p => <ScrollItem key={p.id}><ProductCard {...p} /></ScrollItem>)}
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

        {/* Flyer: wide banner after the featured row */}
        {flyersReady && (rowBanners[1]
          ? <ImageFlyerBanner className="mt-8 sm:mt-10" flyer={rowBanners[1]} />
          : hasUploadedRows ? null : <FlyerBanner className="mt-8 sm:mt-10" flyer={FLYERS.lowMoq} images={art(FLYERS.lowMoq.offset)} />)}

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

        {/* Flyer: wide banner before the endless feed */}
        {flyersReady && (rowBanners[2]
          ? <ImageFlyerBanner className="mt-8 sm:mt-10" flyer={rowBanners[2]} />
          : hasUploadedRows ? null : <BrandFlyerBanner className="mt-8 sm:mt-10" flyer={BRAND_FLYERS.seamlessOlive} />)}

        <section className="mt-9 sm:mt-12">
          <h2 className="mb-3 font-heading text-xl font-bold sm:text-2xl">You may like</h2>
          {isLoading ? (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
              {Array.from({ length: 10 }).map((_, index) => <div key={index} className="aspect-[3/4] animate-pulse bg-secondary" />)}
            </div>
          ) : feed.length ? (
            <>
              <div className="grid grid-flow-dense grid-cols-4 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 sm:gap-3">
                {feed.slice(0, visible).flatMap((product, i) => {
                  const cells: React.ReactNode[] = [<ProductCard key={product.id} {...product} />];
                  // Flyers inside the feed: a card-sized one after the 6th product of
                  // every 20, a full-width banner after the 14th. grid-flow-dense lets
                  // later products fill any gap a full-width banner leaves.
                  const slot = (i + 1) % 20;
                  const round = Math.floor(i / 20);
                  if (slot === 6 && flyersReady) {
                    if (feedCards.length) {
                      const u = feedCards[round % feedCards.length];
                      cells.push(<div key={`fc-${i}`} className="col-span-2 min-h-[260px] sm:col-span-1"><ImageFlyerFill flyer={u} /></div>);
                    } else {
                      if (round % 2 === 0) {
                        cells.push(<div key={`fc-${i}`} className="col-span-2 min-h-[260px] sm:col-span-1"><BrandFlyerFill flyer={BRAND_FLYERS.mysteryDeal} fit="contain" /></div>);
                      } else {
                        const f = [FLYERS.suppliers, FLYERS.rfq, FLYERS.sell][Math.floor(round / 2) % 3];
                        cells.push(<div key={`fc-${i}`} className="col-span-2 sm:col-span-1"><FlyerCard flyer={f} images={art(f.offset + round * 2, 2)} /></div>);
                      }
                    }
                  }
                  if (slot === 14 && flyersReady) {
                    if (feedBanners.length) {
                      const u = feedBanners[round % feedBanners.length];
                      cells.push(<ImageFlyerBanner key={`fb-${i}`} className="col-span-full" flyer={u} />);
                    } else {
                      const f = [FLYERS.deals, FLYERS.bulk, FLYERS.watch][round % 3];
                      cells.push(<FlyerBanner key={`fb-${i}`} className="col-span-full" flyer={f} images={art(f.offset + round * 2)} />);
                    }
                  }
                  return cells;
                })}
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
    <Link to={to} className="flex min-w-0 items-center gap-3 border border-border bg-card px-3 py-3 transition-colors hover:bg-secondary/60 sm:px-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}
