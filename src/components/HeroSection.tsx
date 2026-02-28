import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import heroBg from '@/assets/hero-bg.jpg';

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden gradient-hero">
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: `url(${heroBg})`, backgroundSize: 'cover', backgroundPosition: 'center' }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-foreground/90 via-foreground/70 to-transparent" />

      <div className="container relative z-10 py-16 md:py-24">
        <div className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-primary/20 text-primary-foreground px-3 py-1 rounded-full text-sm mb-4 backdrop-blur-sm">
              <Zap className="w-3.5 h-3.5" />
              <span>Nigeria's #1 Tech Marketplace</span>
            </div>
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-background leading-tight">
              Buy, Sell & <span className="text-primary">Grow</span> With Confidence
            </h1>
            <p className="mt-4 text-background/70 text-lg max-w-md">
              Premium laptops, electronics & accessories at the best prices. Direct from Computer Village, Ikeja.
            </p>
            <div className="flex flex-wrap gap-3 mt-8">
              <Link to="/products">
                <Button size="lg" className="font-heading font-semibold">
                  Shop Now <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
              <Link to="/category/deals-refurbished">
                <Button size="lg" variant="outline" className="font-heading font-semibold border-background/30 text-background hover:bg-background/10">
                  View Deals
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
