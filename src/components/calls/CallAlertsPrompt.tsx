import { useEffect, useState } from 'react';
import { BellRing, X } from 'lucide-react';
import { toast } from 'sonner';
import { enableCallAlerts, pushSupported, refreshCallAlerts } from '@/lib/callPush';

const DISMISS_KEY = 'callAlertsDismissedAt';
const DISMISS_DAYS = 30;
const dismissedRecently = () => {
  try { const t = Number(localStorage.getItem(DISMISS_KEY)); return !!t && Date.now() - t < DISMISS_DAYS * 86_400_000; } catch { return false; }
};

// A small card asking a signed-in member to allow call alerts, so a call reaches them even when the site is closed.
// Shown only where the browser can do it and the admin has set it up. Already allowed: just keeps the subscription fresh.
export default function CallAlertsPrompt() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    if (Notification.permission === 'granted') { void refreshCallAlerts(); return; }
    if (Notification.permission === 'default' && !dismissedRecently()) setShow(true);
  }, []);

  if (!show) return null;
  const dismiss = () => { try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ } setShow(false); };
  const enable = async () => {
    setBusy(true);
    const r = await enableCallAlerts();
    setBusy(false);
    if (r === 'enabled') { toast.success('Call alerts are on. We will notify you when someone calls.'); setShow(false); }
    else if (r === 'denied') { toast.error('Notifications are blocked. Allow them in your browser settings to get call alerts.'); setShow(false); }
    else toast.error('Could not turn on call alerts on this device.');
  };

  return (
    <div role="region" aria-label="Call alerts"
      className="fixed inset-x-4 bottom-4 z-[60] flex items-start gap-3 rounded-2xl border bg-background p-4 shadow-xl sm:inset-x-auto sm:right-4 sm:max-w-sm">
      <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Get call alerts</p>
        <p className="mt-0.5 text-xs text-muted-foreground">We will notify you when someone calls, even if this site is closed.</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={enable} disabled={busy}
            className="rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">{busy ? 'Turning on…' : 'Turn on'}</button>
          <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">Not now</button>
        </div>
      </div>
      <button type="button" onClick={dismiss} aria-label="Close" className="text-muted-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
