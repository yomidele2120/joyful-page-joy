import { dayLabel } from '@/lib/chatDays';

export default function DayDivider({ iso }: { iso: string }) {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-background/80 px-3 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm ring-1 ring-border">{dayLabel(iso)}</span>
    </div>
  );
}
