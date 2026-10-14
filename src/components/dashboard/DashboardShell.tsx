import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft, LogOut, Menu, Store } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/ThemeToggle';
import { BrandLogo, BrandLogoPill } from '@/components/BrandLogo';
import { cn } from '@/lib/utils';

// One layout for the admin, supplier and buyer dashboards.
//   * Desktop (lg+): a fixed navy sidebar with the tools grouped by purpose.
//   * Phones and tablets: a top bar with a hamburger button that opens the same
//     list of tools in a slide-in drawer, plus the current section's name so
//     people always know where they are.
// The active section lives in the URL (?tab=...), so refresh and back work.

export interface DashNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  group?: string;
  hint?: string;
}

export function useTabParam(defaultTab: string, valid?: string[]) {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab = raw && (!valid || valid.includes(raw)) ? raw : defaultTab;
  const setTab = useCallback((next: string) => {
    const copy = new URLSearchParams(params);
    copy.set('tab', next);
    copy.delete('compose');
    setParams(copy, { replace: true });
  }, [params, setParams]);
  return [tab, setTab] as const;
}

interface ShellProps {
  panelLabel: string;                 // "Admin console", "Seller centre", "My account"
  title: string;                      // person or store name
  subtitle?: string;                  // email, approval status, ...
  items: DashNavItem[];
  active: string;
  onSelect: (key: string) => void;
  onSignOut: () => void;
  headerActions?: React.ReactNode;    // extra buttons in the top bar (desktop and tablet)
  drawerActions?: React.ReactNode;    // extra links at the bottom of the drawer
  notice?: React.ReactNode;           // banner shown above the page content
  children: React.ReactNode;
}

export default function DashboardShell({
  panelLabel, title, subtitle, items, active, onSelect, onSignOut, headerActions, drawerActions, notice, children,
}: ShellProps) {
  const [open, setOpen] = useState(false);
  const current = items.find(i => i.key === active) ?? items[0];
  const CurrentIcon = current?.icon;
  const totalBadges = items.reduce((n, i) => n + (i.badge ?? 0), 0);

  const select = (key: string) => {
    onSelect(key);
    setOpen(false);
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-secondary/40">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">
        <NavPanel
          panelLabel={panelLabel} title={title} subtitle={subtitle}
          items={items} active={active} onSelect={select} onSignOut={onSignOut} drawerActions={drawerActions}
        />
      </aside>

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5 lg:px-8">
            <Button
              variant="ghost" size="icon" className="relative h-10 w-10 shrink-0 lg:hidden"
              onClick={() => setOpen(true)} aria-label="Open dashboard menu" aria-expanded={open}
            >
              <Menu className="h-6 w-6" />
              {totalBadges > 0 && <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-card" />}
            </Button>

            <Link to="/" aria-label="IT Hub Africa home" className="shrink-0 lg:hidden">
              <BrandLogo className="h-8" />
            </Link>

            <div className="mx-2 hidden min-w-0 items-center gap-2 lg:flex">
              {CurrentIcon && <CurrentIcon className="h-5 w-5 text-primary" />}
              <h1 className="truncate font-heading text-lg font-bold">{current?.label}</h1>
            </div>

            <div className="ml-auto flex items-center gap-1.5">
              {headerActions}
              <Button variant="outline" size="sm" asChild className="hidden sm:inline-flex">
                <Link to="/"><Store className="mr-1.5 h-4 w-4" />Store</Link>
              </Button>
              <ThemeToggle />
            </div>
          </div>

          {/* Where am I (phones and tablets) */}
          <div className="flex items-center gap-2 border-t border-border/70 px-4 py-2 lg:hidden">
            {CurrentIcon && <CurrentIcon className="h-4 w-4 text-primary" />}
            <p className="truncate text-sm font-semibold">{current?.label}</p>
            <span className="ml-auto truncate text-xs text-muted-foreground">{panelLabel}</span>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-3 py-5 sm:px-5 lg:px-8 lg:py-8">
          {notice}
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-[320px] border-0 bg-transparent p-0 text-white [&>button]:text-white" onOpenAutoFocus={e => e.preventDefault()}>
          <SheetTitle className="sr-only">{panelLabel} menu</SheetTitle>
          <SheetDescription className="sr-only">Choose a section of your dashboard</SheetDescription>
          <NavPanel
            panelLabel={panelLabel} title={title} subtitle={subtitle}
            items={items} active={active} onSelect={select} onSignOut={onSignOut} drawerActions={drawerActions}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NavPanel({
  panelLabel, title, subtitle, items, active, onSelect, onSignOut, drawerActions,
}: Pick<ShellProps, 'panelLabel' | 'title' | 'subtitle' | 'items' | 'active' | 'onSelect' | 'onSignOut' | 'drawerActions'>) {
  // Keep the order the caller gave, but start a new heading whenever the group changes.
  const sections: { group?: string; items: DashNavItem[] }[] = [];
  items.forEach(item => {
    const last = sections[sections.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else sections.push({ group: item.group, items: [item] });
  });

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-[hsl(208_70%_12%)] via-[hsl(208_75%_9%)] to-[hsl(208_80%_6%)] text-white">
      <div className="px-5 pb-4 pt-5">
        <Link to="/" aria-label="IT Hub Africa home"><BrandLogoPill logoClassName="h-8" /></Link>
        <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">{panelLabel}</p>
        <p className="mt-1 truncate font-heading text-base font-bold">{title}</p>
        {subtitle && <p className="truncate text-xs text-white/60">{subtitle}</p>}
      </div>

      <nav aria-label={`${panelLabel} sections`} className="flex-1 overflow-y-auto px-3 pb-3">
        {sections.map((section, si) => (
          <div key={si} className="mb-3">
            {section.group && <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">{section.group}</p>}
            <ul className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = item.key === active;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                        isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-accent" aria-hidden="true" />}
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      {!!item.badge && item.badge > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-bold text-accent-foreground">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-white/10 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        {drawerActions}
        <Link to="/" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
          <ArrowLeft className="h-[18px] w-[18px]" /> Back to store
        </Link>
        <button
          type="button" onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-300 hover:bg-white/5 hover:text-red-200"
        >
          <LogOut className="h-[18px] w-[18px]" /> Log out
        </button>
      </div>
    </div>
  );
}

/* ---------- Shared building blocks for dashboard pages ---------- */

const TONES = {
  primary: 'bg-primary/10 text-primary',
  accent: 'bg-accent/15 text-accent',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
} as const;

export function StatCard({
  icon, label, value, loading, tone = 'primary', hint,
}: { icon: React.ReactNode; label: string; value: string; loading?: boolean; tone?: keyof typeof TONES; hint?: string }) {
  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="space-y-1.5"><Skeleton className="h-3 w-16" /><Skeleton className="h-5 w-20" /></div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&_svg]:h-5 [&_svg]:w-5', TONES[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-heading text-xl font-bold leading-tight">{value}</p>
        {hint && <p className="truncate text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

/** Rounded white panel with an optional heading row. */
export function Panel({
  title, action, children, className, flush,
}: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-heading text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      <div className={flush ? '' : 'p-4'}>{children}</div>
    </section>
  );
}

/** Navy welcome banner used at the top of each dashboard's overview. */
export function WelcomeBanner({ title, text, children }: { title: string; text?: string; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[hsl(208_77%_16%)] via-[hsl(208_75%_12%)] to-[hsl(208_80%_8%)] p-5 text-white sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-heading text-xl font-bold sm:text-2xl">{title}</h2>
          {text && <p className="mt-1 max-w-xl text-sm text-white/70">{text}</p>}
        </div>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </div>
  );
}
