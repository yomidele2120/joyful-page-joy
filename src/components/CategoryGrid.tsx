import { Link } from 'react-router-dom';
import { useCategories } from '@/hooks/useProducts';
import { Laptop, Monitor, Printer, Smartphone, Gamepad2, Headphones, Cpu, Battery, Camera, Watch, Tv, Tag, Tablet, Package } from 'lucide-react';
import { motion } from 'framer-motion';

const iconMap: Record<string, React.ReactNode> = {
  'laptops-computers': <Laptop className="w-6 h-6" />,
  'desktop-computers': <Cpu className="w-6 h-6" />,
  'printers': <Printer className="w-6 h-6" />,
  'monitors': <Monitor className="w-6 h-6" />,
  'accessories': <Headphones className="w-6 h-6" />,
  'smartphones': <Smartphone className="w-6 h-6" />,
  'tablets-ereaders': <Tablet className="w-6 h-6" />,
  'gaming-devices': <Gamepad2 className="w-6 h-6" />,
  'electronics': <Package className="w-6 h-6" />,
  'deals-refurbished': <Tag className="w-6 h-6" />,
  'power-banks-chargers': <Battery className="w-6 h-6" />,
  'cameras-drones': <Camera className="w-6 h-6" />,
  'wearables': <Watch className="w-6 h-6" />,
  'smart-tvs': <Tv className="w-6 h-6" />,
};

export default function CategoryGrid() {
  const { data: categories } = useCategories();

  return (
    <section className="py-10">
      <div className="container">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-6">Shop by Category</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {categories?.map((cat, i) => (
            <motion.div
              key={cat.id}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.3 }}
            >
              <Link
                to={`/category/${cat.slug}`}
                className="flex flex-col items-center gap-2 p-4 rounded-lg bg-card card-shadow hover:card-hover-shadow hover:border-primary border border-transparent transition-all text-center group"
              >
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {iconMap[cat.slug] || <Package className="w-6 h-6" />}
                </div>
                <span className="text-xs font-medium text-card-foreground leading-tight">{cat.name}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
