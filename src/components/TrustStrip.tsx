import { Link } from 'react-router-dom';
import { BadgeCheck, Clapperboard, FileText, ShieldCheck } from 'lucide-react';
import { useMarketplaceStats } from '@/hooks/useProducts';

// Four trust / shortcut tiles under the hero. Counts come from the database.
export default function TrustStrip() {
  const { data: stats } = useMarketplaceStats();

  const tiles = [
    { to: '/products', icon: <ShieldCheck />, title: 'Secure checkout', text: 'Pay safely with Paystack' },
    {
      to: '/products?tab=suppliers', icon: <BadgeCheck />, title: 'Verified suppliers',
      text: stats?.vendorCount ? `${stats.vendorCount} approved sellers` : 'Approved sellers',
    },
    { to: '/rfq/new', icon: <FileText />, title: 'Request for quotation', text: 'Get quotes from suppliers' },
    { to: '/feed', icon: <Clapperboard />, title: 'Watch & shop', text: 'Videos from sellers' },
  ];

  return (
    <section className="container max-w-[1440px] pt-3">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        {tiles.map(tile => (
          <Link key={tile.title} to={tile.to} className="flex min-w-0 items-center gap-3 bg-card px-4 py-3 transition-colors hover:bg-secondary/60">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">{tile.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{tile.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{tile.text}</span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
