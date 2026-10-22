// A slow, continuously moving strip of brand logos (the same idea as the logo strip near the footer on cdcare.ng).
// The list is repeated once and the track slides left by exactly half its width, so the loop has no jump.
// Hover pauses it. People who ask their phone for less motion get a strip they can swipe instead.
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
  // White tile so dark logos (Samsung, Apple) stay visible in dark mode.
  return (
    <li className="flex h-14 w-28 shrink-0 items-center justify-center rounded-md border border-border bg-white px-4 sm:h-16 sm:w-32">
      <img
        src={src}
        alt={decorative ? '' : name}
        aria-hidden={decorative || undefined}
        loading="lazy"
        decoding="async"
        className="max-h-8 max-w-full object-contain sm:max-h-9"
        onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none'; }}
      />
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
      {/* Edges fade out so logos slide in and out softly. */}
      <div
        className="overflow-hidden motion-reduce:overflow-x-auto [-webkit-mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)] [mask-image:linear-gradient(to_right,transparent,#000_8%,#000_92%,transparent)]"
      >
        <div className="flex w-max animate-marquee gap-4 motion-reduce:animate-none hover:[animation-play-state:paused] sm:gap-6">
          <ul className="flex shrink-0 items-center gap-4 sm:gap-6">
            {brands.map(b => <Logo key={b.name} {...b} />)}
          </ul>
          <ul className="flex shrink-0 items-center gap-4 sm:gap-6" aria-hidden="true">
            {brands.map(b => <Logo key={b.name} {...b} decorative />)}
          </ul>
        </div>
      </div>
    </section>
  );
}
