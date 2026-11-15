import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { ImageOff } from 'lucide-react';
import { listImage } from '@/lib/images';
import { ProductPrice, type ProductCardProps } from '@/components/ProductCard';

type Item = Pick<ProductCardProps, 'id' | 'name' | 'slug' | 'price' | 'compare_at_price' | 'image_url' | 'thumb_url' | 'price_tiers'>;

// A fan of real products on a 3D stage. The whole stage turns gently towards the pointer; each card floats at its own depth.
// Phones show a swipeable row instead (same cards, no fan), so nothing depends on hover.
export default function Showcase3D({ items }: { items: Item[] }) {
  const reduce = useReducedMotion();
  const stage = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 90, damping: 18 });
  const sy = useSpring(py, { stiffness: 90, damping: 18 });
  const ry = useTransform(sx, [0, 1], [-14, 14]);
  const rx = useTransform(sy, [0, 1], [8, -8]);

  const shown = items.filter(i => listImage(i)).slice(0, 5);
  if (shown.length < 3) return null;

  const onMove = (e: React.PointerEvent) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => { px.set(0.5); py.set(0.5); };

  const card = (p: Item) => (
    <Link to={`/product/${p.slug}`} className="block overflow-hidden rounded-2xl bg-card shadow-2xl ring-1 ring-black/5">
      <span className="block aspect-square bg-white">
        {listImage(p)
          ? <img src={listImage(p)!} alt={p.name} loading="lazy" decoding="async" className="h-full w-full object-contain" />
          : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff className="h-6 w-6" /></span>}
      </span>
      <span className="block p-2.5">
        <span className="line-clamp-1 text-xs font-medium">{p.name}</span>
        <ProductPrice product={p} className="mt-0.5" compact />
      </span>
    </Link>
  );

  // Fan layout: centre card is nearest the viewer; the others step back and turn away.
  const mid = (shown.length - 1) / 2;

  return (
    <section className="relative mt-6 overflow-hidden bg-[#0a2236] text-white sm:mt-8" aria-label="Featured products">
      <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true"
           style={{ background: 'radial-gradient(60% 80% at 50% 0%, rgba(56,140,220,.55), transparent 70%)' }} />
      <div className="container relative max-w-[1440px] py-8 sm:py-12">
        <div className="max-w-xl">
          <h2 className="font-heading text-2xl font-bold sm:text-4xl">Buy direct from verified suppliers</h2>
          <p className="mt-2 text-sm text-white/70 sm:text-base">Real listings from sellers across Nigeria. Open any product to see the supplier, the minimum order and the price.</p>
        </div>

        {/* Phones and "reduce motion": a plain swipeable row. */}
        <ul className={`-mx-4 mt-6 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] ${reduce ? '' : 'md:hidden'} ${reduce ? 'md:mx-0 md:px-0' : ''}`}>
          {shown.map(p => <li key={p.id} className="w-44 shrink-0 snap-start">{card(p)}</li>)}
        </ul>

        {!reduce && (
          <div
            ref={stage}
            onPointerMove={onMove}
            onPointerLeave={reset}
            className="mt-8 hidden h-[340px] items-center justify-center md:flex lg:h-[400px]"
            style={{ perspective: 1200 }}
          >
            <motion.ul style={{ rotateY: ry, rotateX: rx, transformStyle: 'preserve-3d' }} className="relative h-full w-full">
              {shown.map((p, i) => {
                const d = i - mid;
                return (
                  <li
                    key={p.id}
                    className="absolute left-1/2 top-1/2 w-44 lg:w-52"
                    style={{
                      transform: `translate(-50%, -50%) translateX(${d * 150}px) translateZ(${-Math.abs(d) * 90}px) rotateY(${-d * 14}deg)`,
                      transformStyle: 'preserve-3d',
                      zIndex: 10 - Math.round(Math.abs(d)),
                    }}
                  >
                    <motion.div
                      animate={{ y: [0, -8 - Math.abs(d) * 2, 0] }}
                      transition={{ duration: 4 + i * 0.6, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      {card(p)}
                    </motion.div>
                  </li>
                );
              })}
            </motion.ul>
          </div>
        )}

        <Link to="/products" className="mt-6 inline-block rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#0a2236] hover:bg-white/90">Browse all products</Link>
      </div>
    </section>
  );
}
