// Best-effort loudspeaker / earpiece routing for calls that run inside a web browser.
//
// A browser has no standard "speakerphone" switch. The only tool is HTMLMediaElement.setSinkId, which sends an element's sound to
// one of the outputs listed by enumerateDevices(). Chrome on Android can list outputs such as "Speakerphone" and "Earpiece";
// iPhone Safari generally does not. So everything here is feature-detected: when the browser does not expose BOTH a
// loudspeaker and an earpiece, nothing is changed and the call keeps the browser's own routing.

export interface OutputDevice { deviceId: string; label: string }

/** A media element that may support choosing its output (setSinkId is missing in some browsers). */
type SinkElement = HTMLMediaElement & { setSinkId?: (id: string) => Promise<void>; sinkId?: string };

const EARPIECE = /(ear\s?piece|ear\s?speaker|receiver|handset|telephone)/i;
const NOT_LOUD = /(ear\s?piece|ear\s?speaker|receiver|handset|telephone|head(set|phone)|bluetooth|airpod|buds|hands-?free)/i;
const LOUD = /speaker/i;

/** The phone's earpiece, if the browser lists one. */
export function pickEarpiece(devices: OutputDevice[]): OutputDevice | null {
  return devices.find((d) => EARPIECE.test(d.label)) ?? null;
}

/** The loudspeaker ("Speaker", "Speakerphone"), if listed. Headsets, Bluetooth and the earpiece never count. */
export function pickSpeaker(devices: OutputDevice[]): OutputDevice | null {
  return devices.find((d) => LOUD.test(d.label) && !NOT_LOUD.test(d.label)) ?? null;
}

/** Switching is only offered when the browser lists both a loudspeaker and an earpiece (that is, a phone it can really control). */
export const canSwitchSpeaker = (devices: OutputDevice[]) => !!pickSpeaker(devices) && !!pickEarpiece(devices);

export const isSinkIdSupported = () =>
  typeof HTMLMediaElement !== 'undefined' && typeof (HTMLMediaElement.prototype as SinkElement).setSinkId === 'function';

/** Audio outputs the browser lists (labels are empty until the microphone has been allowed, which a call does). */
export async function listOutputDevices(): Promise<OutputDevice[]> {
  try {
    if (!isSinkIdSupported() || !navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audiooutput').map((d) => ({ deviceId: d.deviceId, label: d.label || '' }));
  } catch { return []; }
}

export interface OutputRouter {
  setDevices: (devices: OutputDevice[]) => void;
  /** true: loudspeaker. false: earpiece (or the browser default when no earpiece is listed). Does nothing where unsupported. */
  setLoud: (loud: boolean) => void;
  /** Give every element back to the browser's default output. */
  stop: () => void;
}

/**
 * Routes the sound of every audio/video element on the page (including ones the call kit adds later) to the chosen output.
 * Call stop() when the call ends so the rest of the site goes back to normal.
 */
export function createOutputRouter(): OutputRouter {
  let devices: OutputDevice[] = [];
  let target: string | null = null;           // null = leave the browser alone
  const touched = new WeakSet<HTMLMediaElement>();
  let observer: MutationObserver | undefined;
  let timer: number | undefined;

  const route = (el: HTMLMediaElement, id: string) => {
    const e = el as SinkElement;
    if (typeof e.setSinkId !== 'function' || e.sinkId === id) return;
    try { Promise.resolve(e.setSinkId(id)).then(() => touched.add(el)).catch(() => { /* not allowed or not available: keep the default */ }); } catch { /* ignore */ }
  };
  const applyAll = () => {
    if (target === null || typeof document === 'undefined') return;
    document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => route(el, target as string));
  };
  const watch = () => {
    if (observer || typeof document === 'undefined') return;
    observer = new MutationObserver(applyAll);
    observer.observe(document.body, { childList: true, subtree: true });
    timer = window.setInterval(applyAll, 3000);   // safety net for elements the observer misses
  };

  return {
    setDevices(d) { devices = d; },
    setLoud(loud) {
      if (!canSwitchSpeaker(devices)) { target = null; return; }
      target = loud ? pickSpeaker(devices)!.deviceId : pickEarpiece(devices)!.deviceId;
      applyAll(); watch();
    },
    stop() {
      target = null;
      observer?.disconnect(); observer = undefined;
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
      if (typeof document === 'undefined') return;
      document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => {
        if (!touched.has(el)) return;
        try { Promise.resolve((el as SinkElement).setSinkId?.('')).catch(() => { /* ignore */ }); } catch { /* ignore */ }
      });
    },
  };
}
