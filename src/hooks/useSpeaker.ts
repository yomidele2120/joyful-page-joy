import { useEffect, useRef, useState } from 'react';
import { canSwitchSpeaker, createOutputRouter, listOutputDevices, type OutputRouter } from '@/lib/audioOutput';
import type { CallType } from '@/lib/zego';

// Loudspeaker / earpiece switch for a call in progress. Video calls always use the loudspeaker. Voice calls start on the earpiece.
// Switching only works where the browser lists both a loudspeaker and an earpiece (see lib/audioOutput.ts); elsewhere canSwitch is false.
export function useSpeaker(type: CallType, active: boolean) {
  const router = useRef<OutputRouter | null>(null);
  const [canSwitch, setCanSwitch] = useState(false);
  const [loud, setLoud] = useState(type === 'video');
  const loudRef = useRef(loud);
  loudRef.current = type === 'video' ? true : loud;

  useEffect(() => { setLoud(type === 'video'); }, [type, active]);

  useEffect(() => {
    if (!active) return;
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
    const t1 = window.setTimeout(refresh, 1500);      // device names appear only after the microphone is allowed
    const t2 = window.setTimeout(refresh, 5000);
    navigator.mediaDevices?.addEventListener?.('devicechange', refresh);
    return () => {
      alive = false;
      window.clearTimeout(t1); window.clearTimeout(t2);
      navigator.mediaDevices?.removeEventListener?.('devicechange', refresh);
      r.stop(); router.current = null;
    };
  }, [active]);

  useEffect(() => { router.current?.setLoud(type === 'video' ? true : loud); }, [loud, type]);

  return { canSwitch: canSwitch && type !== 'video', loud: type === 'video' ? true : loud, toggle: () => setLoud((v) => !v) };
}
