import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Clapperboard, FileText, ShoppingBag } from 'lucide-react';
import { useCategories, useProducts } from '@/hooks/useProducts';

// Desktop: category list on the left + auto-playing banner on the right.
// Mobile: just the banner. Slides use real data only (featured products,
// real categories) - no invented numbers or claims.

const AUTOPLAY_MS = 5500;

interface Slide {
  key: string;
  eyebrow: string;
  title: string;
  cta: string;
  href: string;
  icon: React.ReactNode;
  tone: string;
}

const SLIDES: Slide[] = [
  {
    key: 'bulk', eyebrow: 'Wholesale marketplace', title: 'Source in bulk from verified suppliers',
    cta: 'Browse products', href: '/products', icon: <ShoppingBag className="h-10 w-10" />,
    tone: 'from-primary to-primary/70 text-primary-foreground',
  },
  {
    key: 'rfq', eyebrow: 'Request for quotation', title: "Can't find it? Tell suppliers what you need",
    cta: 'Post a request', href: '/rfq/new', icon: <FileText className="h-10 w-10" />,
    tone: 'from-foreground to-foreground/80 text-background',
  },
  {
    key: 'watch', eyebrow: 'Watch & shop', title: 'See products in action from sellers across Nigeria',
    cta: 'Watch now', href: '/feed', icon: <Clapperboard className="h-10 w-10" />,
    tone: 'from-accent to-accent/70 text-accent-foreground',
  },
];

export default function HeroCarousel() {
  const { data: categories } = useCategories();
  const { data: featured } = useProducts({ featured: true, limit: 4 });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const picks = (featured ?? []).filter(p => !!p.image_url).slice(0, 4);
  const total = SLIDES.length + (picks.length >= 2 ? 1 : 0);

  const go = useCallback((next: number) => setIndex(((next % total) + total) % total), [total]);

  useEffect(() => {
    if (paused || total < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIndex(i => (i + 1) % total), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, total]);

  return (
    <section className="container max-w-[1440px] pt-4">
      <div className="grid gap-3 lg:grid-cols-[230px_minmax(0,1fr)]">
        {/* Category list (desktop) */}
        <aside className="hidden lg:block">
          <nav aria-label="Categories" className="h-[320px] overflow-y-auto rounded-lg border border-border bg-card py-2">
            <p className="px-4 pb-1 pt-1 font-heading text-sm font-semibold">Categories</p>
            {(categories ?? []).map(cat => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="block px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
                {cat.name}
              </Link>
            ))}
            <Link to="/products" className="block px-4 py-2 text-sm font-medium text-primary">All products</Link>
          </nav>
        </aside>

        {/* Slider */}
        <div
          className="relative h-[210px] overflow-hidden rounded-lg sm:h-[260px] lg:h-[320px]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured promotions"
        >
          <div className="flex h-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${index * 100}%)` }}>
            {SLIDES.map((slide, i) => (
              <div key={slide.key} className={`flex h-full w-full shrink-0 items-center bg-gradient-to-br px-6 sm:px-12 ${slide.tone}`} aria-hidden={index !== i}>
                <div className="max-w-md">
                  <p className="text-xs font-semibold uppercase opacity-80">{slide.eyebrow}</p>
                  <h2 className="mt-2 font-heading text-2xl font-bold leading-tight sm:text-3xl lg:text-4xl">{slide.title}</h2>
                  <Link to={slide.href} tabIndex={index === i ? 0 : -1} className="mt-5 inline-flex items-center gap-2 rounded-full bg-background px-5 py-2 text-sm font-semibold text-foreground transition-transform active:scale-95">
                    {slide.cta} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="ml-auto hidden opacity-30 sm:block [&_svg]:h-32 [&_svg]:w-32">{slide.icon}</div>
              </div>
            ))}

            {picks.length >= 2 && (
              <div className="flex h-full w-full shrink-0 items-center gap-4 bg-secondary px-4 sm:px-12" aria-hidden={index !== SLIDES.length}>
                <div className="hidden max-w-[220px] sm:block">
                  <p className="text-xs font-semibold uppercase text-primary">Top picks</p>
                  <h2 className="mt-2 font-heading text-2xl font-bold leading-tight lg:text-3xl">Featured by our suppliers</h2>
                  <Link to="/products" tabIndex={index === SLIDES.length ? 0 : -1} className="mt-5 inline-flex items-center gap-2 rounded-full border border-foreground px-5 py-2 text-sm font-semibold">
                    Source now <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="grid flex-1 grid-cols-4 gap-2 sm:ml-auto sm:max-w-[420px] sm:grid-cols-2">
                  {picks.map(p => (
                    <Link key={p.id} to={`/product/${p.slug}`} tabIndex={index === SLIDES.length ? 0 : -1} className="aspect-square overflow-hidden rounded-lg bg-white">
                      <img src={p.image_url!} alt={p.name} className="h-full w-full object-contain p-1" loading="lazy" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow hover:bg-background sm:block">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-background/80 p-1.5 shadow hover:bg-background sm:block">
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className={`h-2 rounded-full transition-all ${i === index ? 'w-5 bg-background' : 'w-2 bg-background/50'}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
