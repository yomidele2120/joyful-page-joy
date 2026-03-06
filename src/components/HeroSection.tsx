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

      <div className="container relative z-10 py-10 md:py-20">
        <div className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-1.5 bg-primary/20 text-primary-foreground px-2.5 py-0.5 rounded-full text-xs mb-3 backdrop-blur-sm">
              <Zap className="w-3 h-3" />
              <span>Nigeria's #1 Tech Marketplace</span>
            </div>
            <h1 className="font-heading text-2xl md:text-4xl lg:text-5xl font-bold text-background leading-tight">
              Buy, Sell & <span className="text-primary">Grow</span> With Confidence
            </h1>
            <p className="mt-3 text-background/70 text-sm md:text-base max-w-md">
              Premium laptops, phones and accessories — top brands and trusted sellers.
            </p>
            <div className="flex flex-wrap gap-2 mt-5">
              <Link to="/products">
                <Button size="sm" className="font-heading font-semibold text-xs">
                  Shop Now <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
              <Link to="/category/deals-refurbished">
                <Button size="sm" variant="outline" className="font-heading font-semibold text-xs border-background/30 text-background hover:bg-background/10">
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
