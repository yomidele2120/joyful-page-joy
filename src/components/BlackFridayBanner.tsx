import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandLogoPill } from '@/components/BrandLogo';
import { BLACK_FRIDAY_END, BLACK_FRIDAY_START, blackFridayPhase, splitDuration } from '@/lib/blackFriday';

const pad = (n: number) => String(n).padStart(2, '0');

/** The first thing on the home page during Black Friday. Hides itself once the sale is over. */
export default function BlackFridayBanner() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const phase = blackFridayPhase(now);
  if (phase === 'over') return null;
  const target = phase === 'coming' ? BLACK_FRIDAY_START : BLACK_FRIDAY_END;
  const t = splitDuration(target - now);
  const units: [string, number][] = [['Days', t.days], ['Hours', t.hours], ['Mins', t.minutes], ['Secs', t.seconds]];

  return (
    <section aria-label="Black Friday" className="container max-w-[1440px] pt-3 sm:pt-4">
      <div className="relative isolate overflow-hidden rounded-2xl bg-[#0b0b0c] text-white">
        {/* A faint orange glow behind the headline. */}
        <div aria-hidden="true" className="absolute -left-24 top-1/2 -z-10 h-72 w-72 -translate-y-1/2 rounded-full bg-orange-500/20 blur-3xl" />

        <div className="grid items-center gap-5 px-5 py-6 sm:px-8 sm:py-8 md:grid-cols-[1.4fr_1fr] md:gap-8">
          <div>
            <BrandLogoPill logoClassName="h-7 sm:h-9" />
            <p className="mt-4 text-sm font-medium text-orange-300 sm:text-base">
              {phase === 'coming' ? 'Starting Friday 27 November' : 'The sale is on until Monday 30 November'}
            </p>
            <h2 className="font-heading text-[2.6rem] font-extrabold leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
              Black<br className="max-sm:hidden" /> Friday
            </h2>
            <p className="mt-3 max-w-md text-sm text-white/75 sm:text-base">
              Deals on laptops, phones, printers and accessories from verified suppliers.
            </p>
          </div>

          <div className="rounded-xl bg-orange-500 p-4 text-black sm:p-5">
            <p className="mb-2 text-sm font-semibold">{phase === 'coming' ? 'Starts in' : 'Ends in'}</p>
            <div className="flex gap-2" role="timer" aria-live="off">
              {units.map(([label, value]) => (
                <div key={label} className="min-w-[3.6rem] flex-1 rounded-xl bg-white px-2 py-2.5 text-center text-black shadow-sm sm:flex-none sm:min-w-[4.4rem]">
                  <div className="font-heading text-2xl font-extrabold tabular-nums sm:text-3xl">{pad(value)}</div>
                  <div className="text-[11px] font-medium text-black/60">{label}</div>
                </div>
              ))}
            </div>
            <Link
              to="/products"
              className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-black px-6 py-3 text-base font-bold text-white transition hover:bg-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:w-auto"
            >
              Shop the deals
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Black Friday as the FIRST slide of the home page slider. A different look from the banner above the hero:
 *  bright amber, black block lettering and a price-tag countdown. The slider is always 2:1, so it is laid out for that shape. */
export function BlackFridaySlide({ tabIndex = 0 }: { tabIndex?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const phase = blackFridayPhase(now);
  const t = splitDuration((phase === 'coming' ? BLACK_FRIDAY_START : BLACK_FRIDAY_END) - now);
  const units: [string, number][] = [['d', t.days], ['h', t.hours], ['m', t.minutes], ['s', t.seconds]];
  return (
    <div className="relative isolate flex h-full w-full items-center justify-between gap-3 overflow-hidden bg-amber-400 px-4 pb-4 pt-2 text-black sm:gap-6 sm:px-12 sm:pb-6">
      {/* Hazard-style stripe along the bottom edge. */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-2.5 sm:h-4" style={{ background: 'repeating-linear-gradient(-45deg, #0b0b0c 0 10px, transparent 10px 20px)' }} />
      <div className="min-w-0">
        <BrandLogoPill className="px-2 py-1 shadow-none sm:px-3 sm:py-1.5" logoClassName="h-5 sm:h-8 lg:h-9" />
        <h2 className="mt-2 font-heading font-black uppercase leading-[0.9] tracking-tight sm:mt-4">
          <span className="block text-[1.9rem] sm:text-6xl lg:text-7xl">Black</span>
          <span className="mt-0.5 inline-block -rotate-2 bg-black px-2 text-[1.9rem] text-amber-400 sm:mt-1 sm:px-3 sm:text-6xl lg:text-7xl">Friday</span>
        </h2>
        <p className="mt-2 text-[11px] font-bold sm:mt-3 sm:text-base">
          {phase === 'coming' ? 'Starts Friday 27 November' : 'On until Monday 30 November'}
        </p>
      </div>

      {/* Price-tag countdown */}
      <div className="relative shrink-0 rotate-3 rounded-xl bg-black p-2.5 pt-4 text-white shadow-lg sm:rounded-2xl sm:p-5 sm:pt-7">
        <span aria-hidden="true" className="absolute left-1/2 top-1.5 h-2 w-2 -translate-x-1/2 rounded-full bg-amber-400 sm:top-2.5 sm:h-3 sm:w-3" />
        <p className="text-center text-[10px] font-semibold text-amber-300 sm:text-sm">{phase === 'coming' ? 'Starts in' : 'Ends in'}</p>
        <div className="mt-0.5 flex items-baseline justify-center gap-1 font-heading font-extrabold tabular-nums sm:mt-1 sm:gap-2" role="timer" aria-live="off">
          {units.map(([label, value]) => (
            <span key={label} className="text-lg leading-none sm:text-4xl">
              {pad(value)}<span className="ml-px text-[9px] font-semibold text-amber-300 sm:text-sm">{label}</span>
            </span>
          ))}
        </div>
        <Link to="/products" tabIndex={tabIndex} className="mt-2 flex items-center justify-center rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:mt-4 sm:py-2.5 sm:text-base">
          Shop the deals
        </Link>
      </div>
    </div>
  );
}
