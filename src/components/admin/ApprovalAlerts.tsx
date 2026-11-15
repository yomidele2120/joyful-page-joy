import { useEffect, useRef, useState } from 'react';
import { Bell, ChevronDown, ChevronRight } from 'lucide-react';
import { useAdminApprovals } from '@/hooks/useAdminApprovals';

// A pop-up in the corner of every admin page for as long as anything is waiting for approval.
// It opens by itself whenever the number goes up (and on every page load). The admin can fold it down to a bell,
// but it never goes away until the items are dealt with. Clicking a line opens the page where that item is handled.
export default function ApprovalAlerts({ enabled, onOpen }: { enabled: boolean; onOpen: (tab: string) => void }) {
  const { data } = useAdminApprovals(enabled);
  const items = data ?? [];
  const total = items.reduce((n, i) => n + i.count, 0);
  const [open, setOpen] = useState(true);
  const last = useRef(0);

  useEffect(() => {
    if (total > last.current) setOpen(true);
    last.current = total;
  }, [total]);

  if (!enabled || total === 0) return null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} aria-label={`${total} items waiting for approval`}
        className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl">
        <Bell className="h-5 w-5" />
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-semibold text-white">{total > 99 ? '99+' : total}</span>
      </button>
    );
  }

  return (
    <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 w-[min(92vw,22rem)] animate-fade-in overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
      <div className="flex items-center gap-2 bg-accent px-4 py-2.5 text-accent-foreground">
        <Bell className="h-4 w-4" aria-hidden="true" />
        <p className="flex-1 text-sm font-semibold">{total} waiting for your approval</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fold down" className="rounded-full p-1 hover:bg-black/10"><ChevronDown className="h-4 w-4" /></button>
      </div>
      <ul className="divide-y divide-border">
        {items.map(i => (
          <li key={i.key}>
            <button type="button" onClick={() => onOpen(i.tab)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary">
              <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-destructive/10 px-2 text-xs font-bold text-destructive">{i.count}</span>
              <span className="flex-1 text-sm">{i.label}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
