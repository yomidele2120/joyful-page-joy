import { AlertTriangle } from 'lucide-react';
import { useSubscriptionOverview } from '@/hooks/useSubscriptions';
import { alertsOf, daysLeftText, stageView } from '@/lib/subscriptions';

// Shown at the top of every admin page while a subscription is about to expire / has expired, or call minutes are low.
export default function SubscriptionAlertBanner({ onOpen }: { onOpen: () => void }) {
  const { data } = useSubscriptionOverview();
  const alerts = alertsOf(data ?? []);
  if (!alerts.length) return null;
  const worst = stageView(alerts[0].stage, alerts[0].kind).tone;
  return (
    <button type="button" onClick={onOpen}
      className={`mb-4 flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm ${worst === 'bad' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="space-y-0.5">
        {alerts.map(a => (
          <span key={a.id} className="block">
            <strong>{a.name}:</strong> {a.kind === 'term' ? daysLeftText(a.days_left) : `${(a.remaining_minutes ?? 0).toLocaleString()} call minutes left`} - {stageView(a.stage, a.kind).label.toLowerCase()}
          </span>
        ))}
        <span className="block text-xs underline">Open subscriptions</span>
      </span>
    </button>
  );
}
