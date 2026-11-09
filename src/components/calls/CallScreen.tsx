import { useEffect } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { initialsOf, type CallType } from '@/lib/zego';

interface Props {
  mode: 'incoming' | 'outgoing';
  name: string;
  type: CallType;
  onAccept?: () => void;
  /** Decline (incoming) or cancel (outgoing). */
  onEnd: () => void;
}

// Full-screen ringing screen in the style of a phone call: big avatar with pulsing rings, the name, what is happening,
// and large round buttons (green to accept, red to decline or cancel). Used for incoming calls and while we are calling out.
export default function CallScreen({ mode, name, type, onAccept, onEnd }: Props) {
  // Make a ringing call noticeable when the tab is in the background.
  useEffect(() => {
    if (mode !== 'incoming') return;
    const original = document.title;
    let on = false;
    const t = window.setInterval(() => { on = !on; document.title = on ? `Incoming ${type} call` : original; }, 1000);
    return () => { window.clearInterval(t); document.title = original; };
  }, [mode, type]);

  const status = mode === 'incoming' ? `Incoming ${type} call` : 'Calling…';
  const label = `${mode === 'incoming' ? 'Incoming' : 'Outgoing'} ${type} call ${mode === 'incoming' ? 'from' : 'to'} ${name}`;
  return (
    <div role="alertdialog" aria-modal="true" aria-label={label}
      className="fixed inset-0 z-[2147483000] flex flex-col items-center justify-between bg-gradient-to-b from-[#0b2239] via-[#0f3350] to-[#06121f] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] text-white">
      <div className="flex flex-col items-center text-center">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-white/60">
          {type === 'video' ? <Video className="h-3.5 w-3.5" /> : <Phone className="h-3.5 w-3.5" />}
          {type === 'video' ? 'Video call' : 'Voice call'}
        </p>
        <h2 className="mt-3 max-w-[85vw] truncate font-heading text-3xl font-bold">{name}</h2>
        <p className="mt-1.5 text-sm text-white/70" aria-live="polite">{status}</p>
      </div>

      <div className="relative flex h-56 w-56 items-center justify-center" aria-hidden>
        <span className="absolute inset-0 animate-ping rounded-full bg-white/10 [animation-duration:2.4s]" />
        <span className="absolute inset-6 animate-ping rounded-full bg-white/10 [animation-delay:0.6s] [animation-duration:2.4s]" />
        <span className="relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-[#2b6f9e] to-[#1d4a70] text-5xl font-semibold shadow-2xl ring-4 ring-white/15">
          {initialsOf(name)}
        </span>
      </div>

      {mode === 'incoming' ? (
        <div className="flex w-full max-w-xs items-start justify-around">
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onEnd} aria-label="Decline"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition active:scale-95 hover:bg-red-600">
              <PhoneOff className="h-7 w-7" />
            </button>
            <span className="text-xs text-white/70">Decline</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={onAccept} aria-label="Accept"
              className="flex h-16 w-16 animate-bounce items-center justify-center rounded-full bg-emerald-500 shadow-lg transition active:scale-95 hover:bg-emerald-600 [animation-duration:1.6s]">
              {type === 'video' ? <Video className="h-7 w-7" /> : <Phone className="h-7 w-7" />}
            </button>
            <span className="text-xs text-white/70">Accept</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={onEnd} aria-label="Cancel call"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500 shadow-lg transition active:scale-95 hover:bg-red-600">
            <PhoneOff className="h-7 w-7" />
          </button>
          <span className="text-xs text-white/70">Cancel</span>
        </div>
      )}
    </div>
  );
}
