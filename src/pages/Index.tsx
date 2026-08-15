import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/HeroSection';
import TrustMarquee from '@/components/TrustMarquee';
import AboutSection from '@/components/AboutSection';
import CategoryGrid from '@/components/CategoryGrid';
import ProductSection from '@/components/ProductSection';
import BrandLogos from '@/components/BrandLogos';
import { useProducts } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, PlayCircle, Store } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Index() {
  const { isVendor } = useAuth();
  const { data: featured } = useProducts({ featured: true, limit: 10 });
  const { data: newProducts } = useProducts({ badge: 'New', limit: 10 });
  const { data: saleProducts } = useProducts({ badge: 'Big Sale', limit: 10 });
  const { data: premiumProducts } = useProducts({ badge: 'Premium', limit: 10 });
  const { data: gamingProducts } = useProducts({ badge: 'Gaming', limit: 10 });

  return (
    <Layout>
      <HeroSection />
      <TrustMarquee />

      <CategoryGrid />
      <AboutSection />

      <ProductSection eyebrow="Trending" title="Featured Products" products={featured || []} linkTo="/products" />
      <ProductSection eyebrow="Just In" title="Latest Stock" products={newProducts || []} linkTo="/products" tinted />
      <ProductSection eyebrow="Deals" title="Big Sales" products={saleProducts || []} linkTo="/products" />
      <ProductSection eyebrow="Curated" title="Premium Collection" products={premiumProducts || []} linkTo="/products" tinted />
      <ProductSection eyebrow="Level Up" title="Gaming" products={gamingProducts || []} linkTo="/category/gaming-devices" />

      {/* Editorial CTA row */}
      <section className="py-10 md:py-12">
        <div className="container grid sm:grid-cols-2 gap-3">
          <Link
            to="/feed"
            className="group flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-br from-primary to-primary/80 px-6 py-6 text-primary-foreground active:scale-[0.99] transition-transform"
          >
            <div>
              <p className="font-heading text-lg font-bold">Watch &amp; Shop</p>
              <p className="text-sm opacity-90 mt-0.5">Swipe through vendor videos and shop what you see</p>
            </div>
            <PlayCircle className="w-10 h-10 shrink-0 opacity-90 group-hover:scale-110 transition-transform" />
          </Link>

          {!isVendor && (
            <Link
              to="/supplier-signup"
              className="group flex items-center justify-between gap-3 rounded-2xl bg-foreground px-6 py-6 text-background active:scale-[0.99] transition-transform"
            >
              <div>
                <p className="font-heading text-lg font-bold">Become a Vendor</p>
                <p className="text-sm text-background/70 mt-0.5">Open your shop and reach buyers nationwide</p>
              </div>
              <Store className="w-10 h-10 shrink-0 opacity-90 group-hover:scale-110 transition-transform" />
            </Link>
          )}
        </div>
      </section>

      {/* Trusted brands */}
      <section className="py-10 md:py-12 bg-secondary/40 border-y border-border">
        <div className="container">
          <p className="text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-6">
            Trusted brands available on MarketHub
          </p>
          <BrandLogos />
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-14 md:py-20 bg-foreground text-background">
        <div className="container max-w-lg text-center">
          <h2 className="font-heading text-2xl md:text-3xl font-bold mb-2">Stay Updated</h2>
          <p className="text-background/70 text-sm md:text-base mb-7">
            Get the latest deals and product updates directly to your inbox.
          </p>
          <form className="flex gap-2" onSubmit={e => e.preventDefault()}>
            <Input
              placeholder="Enter your email"
              type="email"
              className="flex-1 bg-background/10 border-background/20 text-background placeholder:text-background/50 h-11"
            />
            <Button type="submit" size="lg" className="shrink-0">
              <Send className="w-4 h-4 mr-1.5" /> Subscribe
            </Button>
          </form>
        </div>
      </section>
    </Layout>
  );
}
