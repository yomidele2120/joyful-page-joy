import { useState } from 'react';

// A slow, continuously moving strip of brand logos (the same idea as the logo strip near the footer on cdcare.ng).
// The list is repeated once and the track slides left by exactly half its width, so the loop has no jump.
//
// Built to always show something:
//  - logos load straight away (they are tiny files; lazy loading can leave moving logos blank on some phones)
//  - every logo sits in a fixed-size box, so a file without its own width/height cannot shrink to nothing
//  - if a logo file cannot load, the brand name is shown instead of an empty tile
//  - the edges fade with plain overlays (a CSS mask next to moving content can render blank on some Android phones)
// Hover pauses it on a computer. People who ask their phone for less motion get a strip they can swipe.
const brands = [
  { name: 'Samsung', src: '/brands/samsung.svg' },
  { name: 'Apple', src: '/brands/apple.svg' },
  { name: 'Xiaomi', src: '/brands/xiaomi.svg' },
  { name: 'Infinix', src: '/brands/infinix.svg' },
  { name: 'Tecno', src: '/brands/tecno.svg' },
  { name: 'HP', src: '/brands/hp.svg' },
  { name: 'Dell', src: '/brands/dell.svg' },
  { name: 'Lenovo', src: '/brands/lenovo.svg' },
  { name: 'Acer', src: '/brands/acer.svg' },
  { name: 'ASUS', src: '/brands/asus.svg' },
  { name: 'MSI', src: '/brands/msi.svg' },
];

function Logo({ name, src, decorative }: { name: string; src: string; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  // White tile so dark logos (Samsung, Apple) stay visible in dark mode.
  return (
    <li className="flex h-14 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-white px-4 sm:h-16 sm:w-32">
      {failed ? (
        <span className="text-xs font-semibold text-slate-700" aria-hidden={decorative || undefined}>{name}</span>
      ) : (
        <img
          src={src}
          alt={decorative ? '' : name}
          aria-hidden={decorative || undefined}
          width={80}
          height={32}
          decoding="async"
          className="h-8 w-20 object-contain sm:w-24"
          onError={() => setFailed(true)}
        />
      )}
    </li>
  );
}

export default function BrandMarquee() {
  return (
    <section className="border-y border-border bg-card py-8 sm:py-10" aria-label="Brands on IT Hub Africa">
      <div className="container mb-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Trusted brands</p>
        <h2 className="mt-1 font-heading text-xl font-bold sm:text-2xl">Shop the brands you know</h2>
      </div>
      <div className="relative">
        <div className="overflow-hidden motion-reduce:overflow-x-auto">
          {/* Each list carries its own right padding (not a gap between lists), so -50% is exactly one list: no jump at the loop. */}
          <div className="flex w-max animate-marquee motion-reduce:animate-none [@media(hover:hover)]:hover:[animation-play-state:paused]">
            <ul className="flex shrink-0 items-center gap-4 pr-4 sm:gap-6 sm:pr-6">
              {brands.map(b => <Logo key={b.name} {...b} />)}
            </ul>
            <ul className="flex shrink-0 items-center gap-4 pr-4 sm:gap-6 sm:pr-6" aria-hidden="true">
              {brands.map(b => <Logo key={b.name} {...b} decorative />)}
            </ul>
          </div>
        </div>
        {/* Soft edges so logos slide in and out. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent sm:w-16 motion-reduce:hidden" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent sm:w-16 motion-reduce:hidden" />
      </div>
    </section>
  );
}
