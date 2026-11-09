import { ArrowDownLeft, ArrowUpRight, Phone, PhoneMissed, Video } from 'lucide-react';
import { callCardView, parseCallMessage } from '@/lib/zego';

interface Props { content: string; createdAt: string; own: boolean }

/** A call line in the chat, shown as a small call card: icon, what happened, when it started and how long it lasted. */
export default function CallMessageCard({ content, createdAt, own }: Props) {
  const parsed = parseCallMessage(content);
  if (!parsed) return <p>{content}</p>;
  const v = callCardView(parsed, own, createdAt);
  const missed = v.tone === 'bad';
  const Icon = missed ? PhoneMissed : parsed.type === 'video' ? Video : Phone;
  const when = v.startedAt.toLocaleString([], { hour: 'numeric', minute: '2-digit', ...(isToday(v.startedAt) ? {} : { month: 'short', day: 'numeric' }) });
  const Arrow = own ? ArrowUpRight : ArrowDownLeft;
  return (
    <div className="flex min-w-[11rem] items-center gap-3 py-0.5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${missed ? 'bg-red-500/15 text-red-500' : own ? 'bg-white/15' : 'bg-primary/10 text-primary'}`}>
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-snug ${missed ? 'text-red-500' : ''}`}>{v.title}</p>
        <p className={`flex items-center gap-1 text-xs ${own ? 'text-primary-foreground/75' : 'text-muted-foreground'}`}>
          <Arrow className={`h-3 w-3 ${missed ? 'text-red-500' : ''}`} />
          {v.direction} · {when}{v.duration ? ` · ${v.duration}` : ''}
        </p>
      </div>
    </div>
  );
}

function isToday(d: Date) { const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); }
