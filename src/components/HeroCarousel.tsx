import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCategories, useProducts } from '@/hooks/useProducts';
import { useFlyers } from '@/hooks/useFlyers';
import { FLYERS } from '@/lib/flyers';
import { CtaPill, FlyerArt, FlyerTile, TONES, pickImages } from '@/components/flyers/Flyers';
import { ImageFlyerFill } from '@/components/flyers/ImageFlyers';
import { BrandFlyerFill } from '@/components/flyers/BrandFlyerImage';
import { HERO_IMAGE_SLIDES, MAKE_MONEY_BADGE } from '@/lib/brandFlyers';

// Hero = category list | auto-playing flyer slider | two flyer tiles (desktop).
// On phones the slider comes first and the two tiles sit right under it.
//
// The slider is always 2:1 (HERO_SLIDE_RATIO), on every screen size, because that is the shape of the
// flyers. A flyer drawn at that shape fills it edge to edge. Other shapes are shown whole on soft blurred
// bars rather than cropped. The category list and side tiles stretch to match the slider's height.
// The dots sit under the picture (never on top of the flyer's own text), the arrows appear on hover,
// and on phones the slider can be swiped. Pictures are only loaded for the slide being shown and the next one.
//
// With no uploaded slides, the IT Hub Africa "Elevate your life" flyer leads the slider.
//
// Flyers the admin uploaded ("Hero slider" / "Hero side tile") take over these
// spots. With none uploaded, the built-in flyers below are shown, using real
// product photos passed in from the page.

const AUTOPLAY_MS = 5500;
const SWIPE_PX = 40;
const DOTS_ROW = 'h-7'; // the side panels leave this much room at the bottom so every edge lines up with the picture
const SLIDE_FLYERS = [FLYERS.bulk, FLYERS.rfq, FLYERS.watch];
const SIDE_DEFAULTS = [FLYERS.sell, FLYERS.deals];

export default function HeroCarousel({ images }: { images: string[] }) {
  const { data: categories } = useCategories();
  const { data: featured } = useProducts({ featured: true, limit: 4 });
  const { ready, forPlacement } = useFlyers();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Slides whose pictures may load: the first two to begin with, then whatever is shown or next up.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0, 1]));

  const uploadedSlides = forPlacement('hero_slide');
  const uploadedSide = forPlacement('hero_side').slice(0, 2);
  const U = uploadedSlides.length;
  // Uploaded slides always come first. Built-in slides keep the slideshow
  // moving until the admin has uploaded 3 or more of their own.
  const showBuiltIn = U < 3;

  const picks = (featured ?? []).filter(p => !!p.image_url).slice(0, 4);
  // The Pay later, clothing and preorder flyers are pinned: they stay in the slider even after the admin has
  // uploaded 3 or more of their own (which hides the rest of the built-in slides).
  const imageSlides = showBuiltIn ? HERO_IMAGE_SLIDES : HERO_IMAGE_SLIDES.filter(f => f.pinned);
  const IMG = imageSlides.length;
  const builtInCount = IMG + (showBuiltIn ? SLIDE_FLYERS.length + (picks.length >= 2 ? 1 : 0) : 0);
  const total = !ready ? 0 : U + builtInCount;

  const go = useCallback((next: number) => total > 0 && setIndex(((next % total) + total) % total), [total]);

  useEffect(() => {
    if (total === 0) return;
    setSeen(prev => {
      const next = new Set(prev);
      [index, index + 1, ...(index > 0 ? [index - 1] : [])].forEach(n => next.add(((n % total) + total) % total));
      return next.size === prev.size ? prev : next;
    });
  }, [index, total]);

  // If the number of slides shrinks (a flyer was switched off), stay in range.
  useEffect(() => { if (total > 0 && index >= total) setIndex(0); }, [total, index]);

  useEffect(() => {
    if (paused || total < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setIndex(i => (i + 1) % total), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [paused, total]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    setPaused(true);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    setPaused(false);
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <section className="container max-w-[1440px] pt-0 sm:pt-4">
      <div className="grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_200px] xl:grid-cols-[210px_minmax(0,1fr)_250px]">
        {/* Category list (desktop). Sized by the slider, and scrolls inside when it is longer. */}
        <aside className="relative hidden lg:block">
          <nav aria-label="Categories" className="absolute inset-x-0 bottom-7 top-0 overflow-y-auto border border-border bg-card py-2">
            <p className="px-4 pb-1 pt-1 font-heading text-sm font-semibold">Categories</p>
            {(categories ?? []).map(cat => (
              <Link key={cat.id} to={`/category/${cat.slug}`} className="block px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-primary">
                {cat.name}
              </Link>
            ))}
            <Link to="/products" className="block px-4 py-2 text-sm font-medium text-primary">All products</Link>
          </nav>
        </aside>

        {/* Flyer slider */}
        <div
          className="min-w-0 -mx-4 w-[calc(100%+2rem)] sm:mx-0 sm:w-full"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          role="region"
          aria-roledescription="carousel"
          aria-label="Featured promotions"
        >
          <div
            className="group relative aspect-[2/1] touch-pan-y overflow-hidden bg-secondary"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            onTouchCancel={() => { touchStart.current = null; setPaused(false); }}
          >
          {!ready ? (
            <div className="h-full w-full animate-pulse bg-secondary" />
          ) : (
            <div className="flex h-full transition-transform duration-500 ease-out motion-reduce:transition-none" style={{ transform: `translateX(-${index * 100}%)` }}>
              {uploadedSlides.map((flyer, i) => (
                <div key={flyer.id} className="h-full w-full shrink-0" aria-hidden={index !== i}>
                  <ImageFlyerFill flyer={flyer} tabIndex={index === i ? 0 : -1} fit="auto" load={seen.has(i)} eager={i === 0} />
                </div>
              ))}

              {imageSlides.map((flyer, i) => (
                <div key={flyer.id} className="h-full w-full shrink-0" aria-hidden={index !== U + i}>
                  <BrandFlyerFill flyer={flyer} tabIndex={index === U + i ? 0 : -1} imgClassName={flyer.focus} fit={flyer.fit} load={seen.has(U + i)} eager={U + i === 0} />
                </div>
              ))}

              {showBuiltIn && SLIDE_FLYERS.map((flyer, i) => {
                const art = pickImages(images, flyer.offset, 3);
                return (
                  <div key={flyer.id} className={`flex h-full w-full shrink-0 items-center justify-between gap-2 px-5 sm:px-12 ${TONES[flyer.tone].surface}`} aria-hidden={index !== U + IMG + i}>
                    <div className="max-w-[58%] sm:max-w-md">
                      <h2 className="font-heading text-xl font-bold leading-tight sm:text-3xl lg:text-4xl">{flyer.title}</h2>
                      <p className={`mt-2 hidden text-sm sm:block lg:text-base ${TONES[flyer.tone].muted}`}>{flyer.text}</p>
                      <Link to={flyer.href} tabIndex={index === U + IMG + i ? 0 : -1} className="mt-4 inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:mt-5">
                        <CtaPill flyer={flyer} />
                      </Link>
                    </div>
                    <FlyerArt flyer={flyer} images={art.slice(0, 2)} size="sm" className="shrink-0 sm:hidden" />
                    <FlyerArt flyer={flyer} images={art} size="lg" className="hidden shrink-0 sm:flex" />
                  </div>
                );
              })}

              {showBuiltIn && picks.length >= 2 && (
                <div className="flex h-full w-full shrink-0 items-center gap-4 bg-secondary px-4 sm:px-12" aria-hidden={index !== U + IMG + SLIDE_FLYERS.length}>
                  <div className="hidden max-w-[240px] sm:block">
                    <h2 className="font-heading text-2xl font-bold leading-tight lg:text-3xl">Featured by our suppliers</h2>
                    <Link to="/products" tabIndex={index === U + IMG + SLIDE_FLYERS.length ? 0 : -1} className="mt-5 inline-flex items-center gap-2 border border-foreground px-5 py-2 text-sm font-semibold">
                      Source now <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="grid flex-1 grid-cols-4 gap-2 sm:ml-auto sm:max-w-[460px]">
                    {picks.map(p => (
                      <Link key={p.id} to={`/product/${p.slug}`} tabIndex={index === U + IMG + SLIDE_FLYERS.length ? 0 : -1} className="aspect-square overflow-hidden bg-white">
                        <img src={p.thumb_url || p.image_url!} alt={p.name} className="h-full w-full object-contain p-1" loading="lazy" />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {total > 1 && (
            <>
              {/* Arrows: desktop only, shown when the pointer is over the slider (touch screens swipe instead). */}
              <button onClick={() => go(index - 1)} aria-label="Previous slide" className="absolute left-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow transition-opacity hover:bg-background focus-visible:pointer-events-auto focus-visible:opacity-100 sm:pointer-events-none sm:flex sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button onClick={() => go(index + 1)} aria-label="Next slide" className="absolute right-2 top-1/2 z-10 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow transition-opacity hover:bg-background focus-visible:pointer-events-auto focus-visible:opacity-100 sm:pointer-events-none sm:flex sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100">
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          </div>

          {/* Dots live under the picture so they never cover the flyer's own text. Each one has a roomy tap area. */}
          <div className={`flex ${DOTS_ROW} items-center justify-center`}>
            {total > 1 && Array.from({ length: total }).map((_, i) => (
              <button
                key={i}
                onClick={() => go(i)}
                aria-label={`Go to slide ${i + 1}`}
                aria-current={i === index}
                className="flex h-7 items-center px-1"
              >
                <span className={`block h-2 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-2 bg-foreground/25'}`} />
              </button>
            ))}
          </div>
        </div>

        {/* Side flyers: right column on desktop, a 2-up row under the slider on phones */}
        <div className="relative">
        <div className="grid grid-cols-2 gap-3 lg:absolute lg:inset-x-0 lg:bottom-7 lg:top-0 lg:grid-cols-1 lg:grid-rows-2">
          {!ready
            ? SIDE_DEFAULTS.map(f => <div key={f.id} className="min-h-[120px] animate-pulse bg-secondary" />)
            : SIDE_DEFAULTS.map((fallback, i) => {
                const uploaded = uploadedSide[i];
                return uploaded
                  ? <ImageFlyerFill key={uploaded.id} flyer={uploaded} className="min-h-[120px]" />
                  : <FlyerTile key={fallback.id} flyer={fallback} images={pickImages(images, fallback.offset, 2)} badge={fallback.id === 'sell' ? MAKE_MONEY_BADGE : undefined} />;
              })}
        </div>
        </div>
      </div>
    </section>
  );
}
