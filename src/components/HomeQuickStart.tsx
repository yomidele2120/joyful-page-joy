import { Link } from 'react-router-dom';
import { Store, FileText, Users, Wallet, CalendarClock, Package, Gift } from 'lucide-react';
import { useCategories } from '@/hooks/useProducts';
import Tilt3D from '@/components/Tilt3D';
import { iconMap } from '@/components/CategoryGrid';
import { useReferralPublicInfo } from '@/hooks/useReferralPublicInfo';

interface Props {
  payLater?: boolean;
  preorders?: boolean;
}

// Quick links and a category icon grid for the top of the homepage: one tap to the things people come to do.
export default function HomeQuickStart({ payLater = false, preorders = false }: Props) {
  const { data: categories } = useCategories();
  const { data: referral } = useReferralPublicInfo();

  const links = [
    { to: '/rfq/new', label: 'Request a quote', Icon: FileText, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
    { to: '/products?tab=suppliers', label: 'Find suppliers', Icon: Users, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
    ...(payLater ? [{ to: '/pay-later', label: 'Pay later', Icon: Wallet, tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' }] : []),
    ...(preorders ? [{ to: '/preorders', label: 'Preorders', Icon: CalendarClock, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' }] : []),
    { to: '/sell', label: 'Sell here', Icon: Store, tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-300' },
    ...(referral?.programme_enabled ? [{ to: '/affiliate', label: 'Refer & earn', Icon: Gift, tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-300' }] : []),
  ];
  const cats = (categories ?? []).slice(0, 11);

  return (
    <section className="container max-w-[1440px] pt-4 sm:pt-6" aria-label="Quick start">
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:px-0 md:flex-wrap">
        {links.map(({ to, label, Icon, tone }) => (
          <li key={to} className="shrink-0">
            <Link to={to} className={`inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold sm:text-sm ${tone}`}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </Link>
          </li>
        ))}
      </ul>

      {!!cats.length && (
        <div className="mt-5">
          <div className="mb-3 flex items-end justify-between">
            <h2 className="font-heading text-lg font-bold sm:text-xl">Shop by category</h2>
            <Link to="/products" className="text-sm font-medium text-primary hover:underline">See all</Link>
          </div>
          <ul className="grid grid-cols-4 gap-x-2 gap-y-4 sm:grid-cols-6 lg:grid-cols-12">
            {cats.map(c => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className="group flex flex-col items-center gap-1.5 text-center">
                  <Tilt3D max={18} lift={10}><span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-secondary text-primary shadow-md transition-colors group-hover:bg-primary/10 sm:h-16 sm:w-16">
                    {c.image_url
                      ? <img src={c.image_url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      : <span className="h-6 w-6 sm:h-7 sm:w-7">{iconMap[c.slug] || <Package className="h-full w-full" />}</span>}
                  </span></Tilt3D>
                  <span className="line-clamp-2 text-[11px] leading-tight text-foreground/80 sm:text-xs">{c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
