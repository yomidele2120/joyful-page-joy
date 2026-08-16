import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheck, Truck, Store } from 'lucide-react';
import { motion } from 'framer-motion';
import { useMarketplaceStats } from '@/hooks/useProducts';
import heroBg from '@/assets/hero-bg.jpg';

export default function HeroSection() {
  const { data: stats } = useMarketplaceStats();

  return (
    <section className="relative overflow-hidden gradient-hero">
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/75 to-foreground/40" />

      <div className="container relative z-10 pt-14 pb-20 md:pt-24 md:pb-28">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-1.5 bg-primary/20 text-primary-foreground px-3 py-1 rounded-full text-xs mb-4 backdrop-blur-sm border border-primary-foreground/10">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span>Nigeria&apos;s Online Marketplace</span>
            </div>
            <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-background leading-[1.05] tracking-tight">
              Buy, Sell &amp;{' '}
              <span className="text-primary">Grow</span>
              <br className="hidden sm:block" /> With Confidence
            </h1>
            <p className="mt-4 text-background/70 text-sm md:text-lg max-w-md">
              Fashion, electronics, home goods and more — from vendors you can trust.
            </p>
            <div className="flex flex-wrap gap-3 mt-7">
              <Link to="/products">
                <Button size="lg" className="font-heading font-semibold">
                  Shop Now <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
              <Link to="/category/deals-refurbished">
                <Button size="lg" variant="outline" className="font-heading font-semibold border-background/30 text-background hover:bg-background/10 hover:text-background">
                  View Deals
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Proof strip — floats over the hero's bottom edge, real counts only */}
      <div className="relative z-10 border-t border-background/10">
        <div className="container grid grid-cols-3 divide-x divide-background/15 py-4 md:py-5">
          <Stat icon={<Store className="w-4 h-4" />} value={stats ? `${stats.vendorCount}+` : '—'} label="Verified vendors" />
          <Stat icon={<ShieldCheck className="w-4 h-4" />} value={stats ? `${stats.productCount.toLocaleString()}+` : '—'} label="Products listed" />
          <Stat icon={<Truck className="w-4 h-4" />} value="Nationwide" label="Delivery" />
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center md:flex-row md:items-center gap-1 md:gap-2 px-2 text-center md:text-left">
      <span className="text-primary shrink-0">{icon}</span>
      <span className="font-heading font-bold text-sm sm:text-base text-background leading-none">{value}</span>
      <span className="text-[10px] sm:text-xs text-background/60 leading-none">{label}</span>
    </div>
  );
}
