import { useState, type ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Download, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { downloadCsv, stamp, type CsvCell } from '@/lib/exportCsv';

// Small building blocks shared by the admin analytics screens.

export const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '12 months' },
];

export const num = (v: number | null | undefined) => new Intl.NumberFormat('en-NG').format(Number(v ?? 0));
export const pctOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '-');

/** % change from previous to current. null when there is nothing to compare with. */
export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

export function RangePicker({ days, onChange }: { days: number; onChange: (d: number) => void }) {
  return (
    <div role="group" aria-label="Date range" className="inline-flex rounded-lg border border-border bg-card p-0.5">
      {RANGES.map(r => (
        <button
          key={r.days}
          type="button"
          onClick={() => onChange(r.days)}
          aria-pressed={days === r.days}
          className={cn('rounded-md px-3 py-1.5 text-sm transition-colors',
            days === r.days ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

/** Up/down arrow with the % change. `goodWhenDown` flips the colours (e.g. refunds). */
export function Change({ current, previous, goodWhenDown }: { current: number; previous: number; goodWhenDown?: boolean }) {
  const c = pctChange(current, previous);
  if (c === null) return <span className="text-[11px] text-muted-foreground">new</span>;
  if (Math.abs(c) < 0.05) return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground"><Minus className="h-3 w-3" />0%</span>;
  const up = c > 0;
  const good = goodWhenDown ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
      <Icon className="h-3 w-3" />{Math.abs(Math.round(c * 10) / 10)}%
    </span>
  );
}

export function Kpi({
  label, value, current, previous, goodWhenDown, hint, loading,
}: { label: string; value: string; current?: number; previous?: number; goodWhenDown?: boolean; hint?: string; loading?: boolean }) {
  if (loading) {
    return <div className="rounded-xl border border-border bg-card p-4"><Skeleton className="mb-2 h-3 w-20" /><Skeleton className="h-6 w-24" /></div>;
  }
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate font-heading text-2xl font-bold">{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {current !== undefined && previous !== undefined && <><Change current={current} previous={previous} goodWhenDown={goodWhenDown} /><span>vs previous period</span></>}
        {hint && <span className="truncate">{hint}</span>}
      </p>
    </div>
  );
}

export function ExportButton({ filename, head, rows, disabled }: { filename: string; head: string[]; rows: CsvCell[][]; disabled?: boolean }) {
  return (
    <Button
      type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
      disabled={disabled || rows.length === 0}
      onClick={() => downloadCsv(`${filename}-${stamp()}`, head, rows)}
    >
      <Download className="h-3.5 w-3.5" />Export CSV
    </Button>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** What to show on screen */
  render: (row: T) => ReactNode;
  /** What goes in the CSV and what the column sorts by */
  value: (row: T) => CsvCell;
  sortable?: boolean;
}

/** Sortable table with a CSV export button. */
export function DataTable<T>({
  title, hint, columns, rows, empty, filename, rowKey, defaultSort, loading,
}: {
  title: string; hint?: string; columns: Column<T>[]; rows: T[]; empty: string; filename: string;
  rowKey: (row: T) => string; defaultSort?: { key: string; desc?: boolean }; loading?: boolean;
}) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const col = sort ? columns.find(c => c.key === sort.key) : undefined;
  const sorted = col
    ? [...rows].sort((a, b) => {
        const x = col.value(a); const y = col.value(b);
        // empty values always go last
        if (x === null || x === undefined || x === '') return 1;
        if (y === null || y === undefined || y === '') return -1;
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
        return sort!.desc ? -r : r;
      })
    : rows;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-4">
        <div className="min-w-0">
          <h3 className="font-heading font-bold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <ExportButton filename={filename} head={columns.map(c => c.label)} rows={sorted.map(r => columns.map(c => c.value(r)))} disabled={loading} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              {columns.map(c => (
                <th key={c.key} className={cn('whitespace-nowrap p-3 font-heading', c.align === 'right' ? 'text-right' : 'text-left')}>
                  {c.sortable ? (
                    <button type="button" className="hover:underline" onClick={() => setSort(s => ({ key: c.key, desc: s?.key === c.key ? !s.desc : true }))}>
                      {c.label}{sort?.key === c.key ? (sort.desc ? ' ↓' : ' ↑') : ''}
                    </button>
                  ) : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length} className="p-3"><Skeleton className="h-5 w-full" /></td></tr>
            ) : sorted.length ? sorted.map(r => (
              <tr key={rowKey(r)} className="border-t border-border">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn('p-3', c.align === 'right' ? 'text-right' : 'text-left', i === 0 && 'max-w-[18rem] truncate font-medium')}>{c.render(r)}</td>
                ))}
              </tr>
            )) : <tr><td className="p-3 text-muted-foreground" colSpan={columns.length}>{empty}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
