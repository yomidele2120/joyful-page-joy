import { ShieldCheck, Truck, Wallet, MessageCircle } from 'lucide-react';
import { useMarketplaceStats } from '@/hooks/useProducts';

const values = [
  {
    icon: ShieldCheck,
    title: 'Verified vendors',
    text: 'Every seller is vetted before they can list.',
  },
  {
    icon: Wallet,
    title: 'Secure payments',
    text: 'Encrypted checkout, every time.',
  },
  {
    icon: MessageCircle,
    title: 'Direct chat',
    text: 'Message a vendor before you buy.',
  },
  {
    icon: Truck,
    title: 'Tracked delivery',
    text: 'From the vendor to your door.',
  },
];

export default function AboutSection() {
  const { data: stats } = useMarketplaceStats();

  return (
    <section className="py-14 md:py-20 bg-secondary/40 border-y border-border">
      <div className="container">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-16">
          {/* Story + real numbers */}
          <div>
            <span className="text-xs font-semibold tracking-wide text-primary uppercase">Our story</span>
            <h2 className="font-heading text-2xl md:text-3xl font-bold text-foreground mt-1 mb-4 max-w-md">
              A marketplace built around the people selling, not just the products
            </h2>
            <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-md">
              MarketHub Africa started as a simple idea: give independent vendors the same
              reach as big stores, without losing the direct relationship they have with their
              customers. Buyers get to chat with the person behind the shop, not a call centre.
            </p>

            <div className="flex gap-8 mt-8">
              <StatBlock value={stats ? `${stats.vendorCount}+` : '—'} label="Active vendors" />
              <StatBlock value={stats ? stats.productCount.toLocaleString() : '—'} label="Products listed" />
              <StatBlock value="36" label="States delivered to" />
            </div>
          </div>

          {/* Compact value list — deliberately plain rows, not cards, so it
              doesn't compete visually with the category tiles above it */}
          <div className="divide-y divide-border border-t border-b border-border lg:border-t-0 lg:border-b-0">
            {values.map((v) => (
              <div key={v.title} className="flex items-start gap-4 py-4 first:pt-0 lg:first:pt-4">
                <v.icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-heading text-sm font-semibold text-foreground">{v.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{v.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-heading text-2xl md:text-3xl font-bold text-foreground leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
    </div>
  );
}
