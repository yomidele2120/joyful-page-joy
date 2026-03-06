import { Link } from 'react-router-dom';
import { useCategories } from '@/hooks/useProducts';
import { Laptop, Monitor, Printer, Smartphone, Gamepad2, Headphones, Cpu, Battery, Camera, Watch, Tv, Tag, Tablet, Package } from 'lucide-react';
import { motion } from 'framer-motion';

const iconMap: Record<string, React.ReactNode> = {
  'laptops-computers': <Laptop className="w-5 h-5" />,
  'desktop-computers': <Cpu className="w-5 h-5" />,
  'phones': <Smartphone className="w-5 h-5" />,
  'printers': <Printer className="w-5 h-5" />,
  'monitors': <Monitor className="w-5 h-5" />,
  'accessories': <Headphones className="w-5 h-5" />,
  'smartphones': <Smartphone className="w-5 h-5" />,
  'tablets-ereaders': <Tablet className="w-5 h-5" />,
  'gaming-devices': <Gamepad2 className="w-5 h-5" />,
  'electronics': <Package className="w-5 h-5" />,
  'deals-refurbished': <Tag className="w-5 h-5" />,
  'power-banks-chargers': <Battery className="w-5 h-5" />,
  'cameras-drones': <Camera className="w-5 h-5" />,
  'wearables': <Watch className="w-5 h-5" />,
  'smart-tvs': <Tv className="w-5 h-5" />,
};

export default function CategoryGrid() {
  const { data: categories } = useCategories();

  return (
    <section className="py-6">
      <div className="container">
        <h2 className="font-heading text-lg font-bold text-foreground mb-4">Shop by Category</h2>
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories?.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              className="shrink-0"
            >
              <Link
                to={`/category/${cat.slug}`}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border border-transparent hover:border-primary/20 transition-all text-center group w-[72px]"
              >
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {iconMap[cat.slug] || <Package className="w-5 h-5" />}
                </div>
                <span className="text-[10px] font-medium text-muted-foreground leading-tight line-clamp-2">{cat.name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
