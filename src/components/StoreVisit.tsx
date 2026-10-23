import { useEffect, useState } from 'react';
import { ExternalLink, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { BUSINESS } from '@/config/business';
import { DAYS, formatClock, getStoreStatus, lagosClock } from '@/lib/storeStatus';

// "Visit us": map, address, open/closed, directions, WhatsApp, phone and opening hours.
// Every detail comes from src/config/business.ts, so changing the address or phone there changes it everywhere.

const q = encodeURIComponent(BUSINESS.mapQuery);
const MAP_EMBED = `https://www.google.com/maps?q=${q}&output=embed`;
const MAP_OPEN = `https://www.google.com/maps/search/?api=1&query=${q}`;
const MAP_DIRECTIONS = `https://www.google.com/maps/dir/?api=1&destination=${q}`;

export function StoreVisitPanel({ layout = 'stack' }: { layout?: 'stack' | 'split' }) {
  const hours = BUSINESS.openingHours;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!hours) return;
    const id = setInterval(() => setNow(new Date()), 60_000);   // keep "Open now" correct on a page left open
    return () => clearInterval(id);
  }, [hours]);
  const status = hours ? getStoreStatus(hours, now) : null;
  const today = lagosClock(now).day;
  const [firstLine, ...otherLines] = BUSINESS.addressLines;

  return (
    <div className={layout === 'split' ? 'grid gap-6 md:grid-cols-2' : 'space-y-5'}>
      <div className="relative overflow-hidden rounded-2xl border border-border bg-secondary">
        <iframe
          title={`Map showing ${BUSINESS.brand}`}
          src={MAP_EMBED}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          allowFullScreen
          className={`block w-full border-0 ${layout === 'split' ? 'h-60 md:h-full md:min-h-[22rem]' : 'h-48'}`}
        />
        <a
          href={MAP_OPEN} target="_blank" rel="noopener noreferrer"
          className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-700 shadow"
        >
          Maps <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="space-y-4">
        <address className="not-italic">
          <p className="font-heading text-base font-semibold text-foreground">{firstLine}</p>
          {otherLines.map(line => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}
        </address>

        {status && (
          <p className={`flex items-center gap-2 text-sm font-medium ${status.isOpen ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
            <span className={`h-2 w-2 rounded-full ${status.isOpen ? 'bg-emerald-500' : 'bg-muted-foreground/60'}`} aria-hidden="true" />
            {status.label}
          </p>
        )}

        <div className="space-y-2.5">
          <a
            href={MAP_DIRECTIONS} target="_blank" rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <MapPin className="h-4 w-4" /> Get directions
          </a>
          <a
            href={BUSINESS.whatsappHref} target="_blank" rel="noopener noreferrer"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-600/60 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            <MessageCircle className="h-4 w-4" /> Message us on WhatsApp
          </a>
          <a
            href={BUSINESS.phoneHref}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold transition-colors hover:bg-secondary/60"
          >
            <Phone className="h-4 w-4" /> {BUSINESS.phone}
          </a>
          <a
            href={`mailto:${BUSINESS.email}`}
            className="flex items-center justify-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <Mail className="h-4 w-4" /> {BUSINESS.email}
          </a>
        </div>

        {hours && (
          <div className="rounded-2xl border border-border bg-secondary/40 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opening hours</p>
            <ul className="space-y-1.5 text-sm">
              {DAYS.map(({ key, label }) => {
                const h = hours[key];
                const isToday = key === today;
                return (
                  <li key={key} className="flex items-baseline justify-between gap-3">
                    <span className={isToday ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                      {label}{isToday && <span className="ml-1.5 text-xs font-normal text-muted-foreground">today</span>}
                    </span>
                    <span className={isToday ? 'font-semibold text-foreground' : h ? 'text-foreground/80' : 'text-muted-foreground'}>
                      {h ? `${formatClock(h.open)} - ${formatClock(h.close)}` : 'Closed'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/** The home page block. */
export function StoreVisitSection() {
  return (
    <section className="container max-w-[1440px] py-10 sm:py-14" aria-labelledby="visit-us-heading">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Find us</p>
        <h2 id="visit-us-heading" className="mt-1 font-heading text-xl font-bold sm:text-2xl">Visit us in Computer Village</h2>
        <p className="mt-1 text-sm text-muted-foreground">Come and meet the team. Get directions, call us or message us on WhatsApp.</p>
      </div>
      <div className="rounded-2xl bg-card p-4 ring-1 ring-border/50 sm:p-6">
        <StoreVisitPanel layout="split" />
      </div>
    </section>
  );
}
