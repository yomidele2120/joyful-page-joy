import { Link } from 'react-router-dom';
import { Clapperboard, FileText, Store, BadgeCheck } from 'lucide-react';
import { useMarketplaceStats } from '@/hooks/useProducts';
import { useAuth } from '@/hooks/useAuth';
import { MAKE_MONEY_BADGE } from '@/lib/brandFlyers';

// The one row of shortcuts under the hero (it replaces the old trust strip + action tiles, which
// repeated each other). Phones: icon with a short label under it. Larger screens: icon, title and a hint.
export default function TrustStrip() {
  const { data: stats } = useMarketplaceStats();
  const { isVendor } = useAuth();

  const tiles = [
    { to: '/rfq/new', icon: <FileText />, title: 'Post RFQ', text: 'Get quotes from suppliers' },
    {
      to: '/products?tab=suppliers', icon: <BadgeCheck />, title: 'Suppliers',
      text: stats?.vendorCount ? `${stats.vendorCount} verified sellers` : 'Browse verified sellers',
    },
    { to: '/feed', icon: <Clapperboard />, title: 'Watch & shop', text: 'Videos from sellers' },
    isVendor
      ? { to: '/supplier-dashboard', icon: <Store />, title: 'My store', text: 'Manage your store' }
      : { to: '/supplier-signup', icon: <Store />, title: 'Sell', text: 'Open your store', badge: MAKE_MONEY_BADGE },
  ];

  return (
    <section className="container max-w-[1440px] pt-4">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {tiles.map(tile => (
          <Link
            key={tile.title}
            to={tile.to}
            className="flex min-w-0 flex-col items-center gap-1.5 rounded-2xl bg-card p-2.5 text-center ring-1 ring-border/50 transition-colors hover:bg-secondary/60 sm:flex-row sm:gap-3 sm:p-3 sm:text-left"
          >
            {'badge' in tile && tile.badge
              ? <img src={tile.badge.src} alt={tile.badge.alt} loading="lazy" className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
              : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{tile.icon}</span>}
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-tight sm:truncate sm:text-sm">{tile.title}</span>
              <span className="mt-0.5 hidden truncate text-xs text-muted-foreground sm:block">{tile.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
