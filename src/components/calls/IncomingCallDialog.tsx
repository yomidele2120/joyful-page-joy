import { useEffect } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CallType } from '@/lib/zego';

interface Props { callerName: string; type: CallType; onAccept: () => void; onDecline: () => void }

export default function IncomingCallDialog({ callerName, type, onAccept, onDecline }: Props) {
  // Make a ringing call noticeable when the tab is in the background.
  useEffect(() => {
    const original = document.title;
    let on = false;
    const t = window.setInterval(() => { on = !on; document.title = on ? `Incoming ${type} call` : original; }, 1000);
    return () => { window.clearInterval(t); document.title = original; };
  }, [type]);

  return (
    <div role="alertdialog" aria-live="assertive" aria-label={`Incoming ${type} call from ${callerName}`}
      className="fixed inset-x-3 top-4 z-[2147483000] mx-auto w-auto max-w-sm rounded-2xl border border-border bg-card p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 animate-pulse items-center justify-center rounded-full bg-primary/10 text-primary">
          {type === 'video' ? <Video className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
        </div>
        <div className="min-w-0">
          <p className="truncate font-heading font-bold">{callerName}</p>
          <p className="text-xs text-muted-foreground">Incoming {type} call</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="destructive" onClick={onDecline}><PhoneOff className="mr-1.5 h-4 w-4" />Decline</Button>
        <Button onClick={onAccept} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {type === 'video' ? <Video className="mr-1.5 h-4 w-4" /> : <Phone className="mr-1.5 h-4 w-4" />}Accept
        </Button>
      </div>
    </div>
  );
}
