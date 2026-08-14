import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/HeroSection';
import AboutSection from '@/components/AboutSection';
import CategoryGrid from '@/components/CategoryGrid';
import ProductSection from '@/components/ProductSection';
import { useProducts } from '@/hooks/useProducts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Index() {
  const { data: featured } = useProducts({ featured: true, limit: 10 });
  const { data: newProducts } = useProducts({ badge: 'New', limit: 10 });
  const { data: saleProducts } = useProducts({ badge: 'Big Sale', limit: 10 });
  const { data: premiumProducts } = useProducts({ badge: 'Premium', limit: 10 });
  const { data: gamingProducts } = useProducts({ badge: 'Gaming', limit: 10 });

  return (
    <Layout>
      <HeroSection />

      <section className="container py-4">
        <Link
          to="/feed"
          className="flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-primary to-accent px-5 py-4 text-primary-foreground active:scale-[0.99] transition-transform"
        >
          <div>
            <p className="font-heading font-bold">Watch &amp; Shop</p>
            <p className="text-sm opacity-90">Swipe through vendor videos and shop what you see</p>
          </div>
          <PlayCircle className="w-9 h-9 shrink-0" />
        </Link>
      </section>

      <AboutSection />
      <CategoryGrid />
      <ProductSection title="🔥 Featured Products" products={featured || []} linkTo="/products" />
      <ProductSection title="🆕 Latest Stock" products={newProducts || []} linkTo="/products" />
      <ProductSection title="💰 Big Sales" products={saleProducts || []} linkTo="/products" />
      <ProductSection title="⭐ Premium Collection" products={premiumProducts || []} linkTo="/products" />
      <ProductSection title="🎮 Gaming" products={gamingProducts || []} linkTo="/category/gaming-devices" />

      {/* Newsletter */}
      <section className="py-12">
        <div className="container max-w-lg text-center">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-2">Stay Updated</h2>
          <p className="text-muted-foreground text-sm mb-6">Get the latest deals and product updates directly to your inbox.</p>
          <form className="flex gap-2" onSubmit={e => e.preventDefault()}>
            <Input placeholder="Enter your email" type="email" className="flex-1" />
            <Button type="submit">
              <Send className="w-4 h-4 mr-1" /> Subscribe
            </Button>
          </form>
        </div>
      </section>
    </Layout>
  );
}
