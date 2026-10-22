import { CalendarClock, Wallet } from 'lucide-react';
import { formatLongDate } from '@/hooks/useMarketplace';

// Small labels that tell ordinary, Pay later and preorder products apart. Pill shaped to match the rounded cards.
export function PayLaterBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary ${className}`}>
      <Wallet className="h-3 w-3" aria-hidden="true" /> Pay later
    </span>
  );
}

export function PreorderBadge({ date, className = '' }: { date?: string | null; className?: string }) {
  const label = date ? formatLongDate(date) : '';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground ${className}`}>
      <CalendarClock className="h-3 w-3" aria-hidden="true" /> Preorder{label ? ` - ${label}` : ''}
    </span>
  );
}
