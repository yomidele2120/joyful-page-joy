import Layout from '@/components/layout/Layout';
import HeroSection from '@/components/HeroSection';
import CategoryGrid from '@/components/CategoryGrid';
import ProductSection from '@/components/ProductSection';
import { useProducts } from '@/hooks/useProducts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

export default function Index() {
  const { data: featured } = useProducts({ featured: true, limit: 10 });
  const { data: newProducts } = useProducts({ badge: 'New', limit: 10 });
  const { data: saleProducts } = useProducts({ badge: 'Big Sale', limit: 10 });
  const { data: premiumProducts } = useProducts({ badge: 'Premium', limit: 10 });
  const { data: gamingProducts } = useProducts({ badge: 'Gaming', limit: 10 });

  return (
    <Layout>
      <HeroSection />
      <CategoryGrid />
      <ProductSection title="🔥 Featured Products" products={featured || []} linkTo="/products" />
      <ProductSection title="🆕 Latest Stock" products={newProducts || []} linkTo="/products" />
      <ProductSection title="💰 Big Sales" products={saleProducts || []} linkTo="/products" />
      <ProductSection title="⭐ Premium Collection" products={premiumProducts || []} linkTo="/products" />
      <ProductSection title="🎮 Gaming" products={gamingProducts || []} linkTo="/category/gaming-devices" />

      {/* Brands section */}
      <section className="py-10 bg-secondary">
        <div className="container">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-6 text-center">Trusted Brands</h2>
          <div className="flex flex-wrap items-center justify-center gap-8 text-muted-foreground">
            {['HP', 'Dell', 'Lenovo', 'ASUS', 'MSI', 'Apple', 'Microsoft'].map(brand => (
              <span key={brand} className="font-heading text-xl font-bold opacity-40 hover:opacity-100 hover:text-primary transition-all cursor-default">
                {brand}
              </span>
            ))}
          </div>
        </div>
      </section>

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
