import { useEffect, useRef, useState } from 'react';
import { Phone, Volume2 } from 'lucide-react';
import { canSwitchSpeaker, createOutputRouter, listOutputDevices, type OutputRouter } from '@/lib/audioOutput';
import type { CallType } from '@/lib/zego';

interface Props { type: CallType }

// Shown only while someone is inside a call. Video calls are always sent to the loudspeaker (no button).
// Voice calls start on the earpiece and get a Speaker button. Both only work where the browser lists a loudspeaker AND an
// earpiece (see lib/audioOutput.ts); everywhere else this renders nothing and the call behaves exactly as before.
export default function SpeakerControl({ type }: Props) {
  const router = useRef<OutputRouter | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const [loud, setLoud] = useState(type === 'video');
  const loudRef = useRef(loud);
  loudRef.current = type === 'video' ? true : loud;

  useEffect(() => {
    const r = createOutputRouter();
    router.current = r;
    let alive = true;
    const refresh = async () => {
      const devices = await listOutputDevices();
      if (!alive) return;
      r.setDevices(devices);
      setCanSwitch(canSwitchSpeaker(devices));
      r.setLoud(loudRef.current);
    };
    void refresh();
    // Device names appear only after the microphone is allowed, so look again shortly after the call connects.
    const t1 = window.setTimeout(refresh, 1500);
    const t2 = window.setTimeout(refresh, 5000);
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      alive = false;
      window.clearTimeout(t1); window.clearTimeout(t2);
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
      r.stop(); router.current = null;
    };
  }, []);

  useEffect(() => { router.current?.setLoud(type === 'video' ? true : loud); }, [loud, type]);

  if (type === 'video' || !canSwitch) return null;
  return (
    <button type="button" onClick={() => setLoud((v) => !v)} aria-pressed={loud}
      aria-label={loud ? 'Turn loudspeaker off' : 'Turn loudspeaker on'}
      style={{ zIndex: 2147483001, top: 'max(1rem, env(safe-area-inset-top))' }}
      className={`fixed right-4 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur transition active:scale-95 ${loud ? 'bg-emerald-500' : 'bg-black/60'}`}>
      {loud ? <Volume2 className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
      {loud ? 'Speaker on' : 'Speaker'}
    </button>
  );
}
