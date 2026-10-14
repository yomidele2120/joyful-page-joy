import { Link } from 'react-router-dom';
import { ArrowRight, Clapperboard, FileText, Package, ShoppingBag, Sparkles, Store, Tag } from 'lucide-react';
import type { Flyer, FlyerIconName, FlyerTone } from '@/lib/flyers';

// ---------------------------------------------------------------------------
// Flyer building blocks. Same flyer data, five shapes:
//   FlyerBanner  - wide strip (between rows, inside the feed, top of listings)
//   FlyerPair    - two banners side by side
//   FlyerTile    - compact tile for the hero's side column
//   FlyerCard    - one grid cell, sized like a product card
//   (hero slides + header ticker live in HeroCarousel / HeaderTicker)
// Colours are fixed (not theme tokens) so a flyer looks the same in light and dark mode.
// ---------------------------------------------------------------------------

export const TONES: Record<FlyerTone, { surface: string; muted: string; button: string; tile: string }> = {
  green:  { surface: 'bg-[hsl(208_77%_20%)] text-white',            muted: 'text-white/80',            button: 'bg-white text-[hsl(220_30%_10%)]',            tile: 'bg-[hsl(208_77%_14%)]' },
  ink:    { surface: 'bg-[hsl(220_30%_12%)] text-white ring-1 ring-white/10', muted: 'text-white/70',  button: 'bg-white text-[hsl(220_30%_10%)]',            tile: 'bg-[hsl(220_25%_20%)]' },
  orange: { surface: 'bg-[hsl(28_96%_56%)] text-[hsl(220_30%_10%)]', muted: 'text-[hsl(220_30%_10%)]/80', button: 'bg-[hsl(220_30%_10%)] text-white',          tile: 'bg-[hsl(28_96%_46%)]' },
  mint:   { surface: 'bg-[hsl(208_45%_91%)] text-[hsl(208_60%_14%)]', muted: 'text-[hsl(208_60%_14%)]/75', button: 'bg-[hsl(208_77%_20%)] text-white',          tile: 'bg-[hsl(208_40%_82%)]' },
};

const ICONS: Record<FlyerIconName, React.ComponentType<{ className?: string }>> = {
  bag: ShoppingBag, quote: FileText, store: Store, tag: Tag, play: Clapperboard, box: Package, sparkles: Sparkles,
};

/** Pick `count` product photos starting at `offset`, wrapping around. */
export function pickImages(urls: string[], offset: number, count: number): string[] {
  if (!urls.length) return [];
  const n = Math.min(count, urls.length);
  return Array.from({ length: n }, (_, i) => urls[(offset + i) % urls.length]);
}

// Overlapping white product photos, slightly fanned. Falls back to a large
// icon when the marketplace has no product photos yet.
export function FlyerArt({
  flyer, images, className = '', size = 'md',
}: { flyer: Flyer; images: string[]; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = ICONS[flyer.icon];
  const tone = TONES[flyer.tone];

  if (!images.length) {
    return (
      <div className={`flex items-center justify-center ${className}`} aria-hidden="true">
        <span className={`flex items-center justify-center rounded-2xl ${tone.tile} ${size === 'sm' ? 'h-12 w-12' : 'h-24 w-24'}`}>
          <Icon className={size === 'sm' ? 'h-6 w-6' : 'h-12 w-12'} />
        </span>
      </div>
    );
  }

  const dim = size === 'sm' ? 'h-[72px] w-[72px]' : size === 'lg' ? 'h-36 w-36 lg:h-44 lg:w-44' : 'h-24 w-24 sm:h-28 sm:w-28';
  const rotations = ['-rotate-6', 'rotate-2', 'rotate-6'];

  return (
    <div className={`relative flex items-center ${className}`} aria-hidden="true">
      {images.map((src, i) => (
        <img
          key={`${src}-${i}`}
          src={src}
          alt=""
          loading="lazy"
          className={`${dim} ${rotations[i % 3]} shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-[0_6px_18px_-6px_rgba(0,0,0,0.45)]`}
          style={{ marginLeft: i === 0 ? 0 : -(size === 'sm' ? 28 : size === 'lg' ? 56 : 40), zIndex: i }}
        />
      ))}
    </div>
  );
}

export function CtaPill({ flyer, className = '' }: { flyer: Flyer; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${TONES[flyer.tone].button} ${className}`}>
      {flyer.cta} <ArrowRight className="h-4 w-4" />
    </span>
  );
}

/** Wide strip. Text on the left, product photos on the right. */
export function FlyerBanner({
  flyer, images, className = '',
}: { flyer: Flyer; images: string[]; className?: string }) {
  const tone = TONES[flyer.tone];
  return (
    <Link
      to={flyer.href}
      className={`group relative flex min-h-[140px] items-center justify-between gap-3 overflow-hidden rounded-lg px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-[168px] sm:px-8 ${tone.surface} ${className}`}
    >
      <div className="relative z-10 max-w-[60%] sm:max-w-md">
        <h3 className="font-heading text-lg font-bold leading-tight sm:text-2xl lg:text-[28px]">{flyer.title}</h3>
        <p className={`mt-1.5 hidden text-sm sm:block ${tone.muted}`}>{flyer.text}</p>
        <CtaPill flyer={flyer} className="mt-3 sm:mt-4" />
      </div>
      <FlyerArt flyer={flyer} images={images.slice(0, 3)} size="md" className="shrink-0 translate-x-2 transition-transform duration-300 group-hover:translate-x-0 sm:translate-x-0" />
    </Link>
  );
}

/** Two banners in one row (stack on phones). */
export function FlyerPair({
  a, b, imagesA, imagesB, className = '',
}: { a: Flyer; b: Flyer; imagesA: string[]; imagesB: string[]; className?: string }) {
  return (
    <div className={`grid gap-3 md:grid-cols-2 ${className}`}>
      <FlyerBanner flyer={a} images={imagesA.slice(0, 2)} />
      <FlyerBanner flyer={b} images={imagesB.slice(0, 2)} />
    </div>
  );
}

/** Compact tile for the hero's side column. */
export function FlyerTile({
  flyer, images, className = '',
}: { flyer: Flyer; images: string[]; className?: string }) {
  const tone = TONES[flyer.tone];
  return (
    <Link
      to={flyer.href}
      className={`group relative flex h-full min-h-[120px] flex-col justify-between overflow-hidden rounded-lg p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-4 ${tone.surface} ${className}`}
    >
      <div className="relative z-10 max-w-[75%] lg:max-w-[80%]">
        <h3 className="font-heading text-sm font-bold leading-snug sm:text-base">{flyer.title}</h3>
        <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 group-hover:underline">
          {flyer.cta} <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <FlyerArt flyer={flyer} images={images.slice(0, 2)} size="sm" className="mt-2 self-end max-lg:-mb-6 max-lg:-mr-1 lg:absolute lg:-bottom-4 lg:-right-1 lg:mt-0" />
    </Link>
  );
}

/** One grid cell, roughly the footprint of a product card. */
export function FlyerCard({ flyer, images }: { flyer: Flyer; images: string[] }) {
  const tone = TONES[flyer.tone];
  return (
    <Link
      to={flyer.href}
      className={`group flex h-full flex-col overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${tone.surface}`}
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden">
        <FlyerArt flyer={flyer} images={images.slice(0, 2)} size="md" />
      </div>
      <div className="flex flex-1 flex-col justify-between px-3 pb-3">
        <h3 className="font-heading text-sm font-bold leading-snug sm:text-[15px]">{flyer.title}</h3>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 group-hover:underline">
          {flyer.cta} <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
