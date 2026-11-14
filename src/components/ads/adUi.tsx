import { StatusDot } from '@/components/dashboard/DashboardShell';
import type { StatusInfo } from '@/lib/ads/adStatus';

export const Status = ({ info }: { info: StatusInfo }) => <StatusDot tone={info.tone}>{info.label}</StatusDot>;
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
export const n = (v: unknown) => Number(v ?? 0).toLocaleString();
export function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-card px-3 py-2.5"><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{value}</p></div>;
}
export const errText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
