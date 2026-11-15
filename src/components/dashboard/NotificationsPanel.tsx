import { Link } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/dashboard/DashboardShell';
import { notificationHref, useMarkNotificationsRead, useNotifications } from '@/hooks/useNotifications';

// The same notifications as the bell in the site header, laid out as a page for the account menu.
export default function NotificationsPanel() {
  const { data, isLoading } = useNotifications();
  const mark = useMarkNotificationsRead();
  const list = data ?? [];
  const unread = list.filter(n => !n.is_read);

  return (
    <Panel
      title="Notifications"
      className="max-w-3xl"
      flush
      action={unread.length > 0 ? (
        <Button size="sm" variant="outline" disabled={mark.isPending} onClick={() => mark.mutate(unread.map(n => n.id))}>
          <CheckCheck className="mr-1.5 h-4 w-4" /> Mark all read
        </Button>
      ) : undefined}
    >
      {isLoading ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !list.length ? (
        <div className="p-10 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 h-6 w-6" aria-hidden="true" /> Nothing new yet. Messages, follows and quotes will show up here.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map(n => {
            const body = (
              <span className="flex items-start gap-3 px-4 py-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-accent'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm ${n.is_read ? 'text-muted-foreground' : 'font-medium'}`}>{n.message}</span>
                  <span className="block text-xs text-muted-foreground">{new Date(n.created_at).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                </span>
              </span>
            );
            const href = notificationHref(n);
            return (
              <li key={n.id}>
                {href
                  ? <Link to={href} onClick={() => !n.is_read && mark.mutate([n.id])} className="block hover:bg-secondary">{body}</Link>
                  : <button type="button" onClick={() => !n.is_read && mark.mutate([n.id])} className="block w-full text-left hover:bg-secondary">{body}</button>}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
