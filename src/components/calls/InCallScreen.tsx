import { useEffect, useState, type ReactNode } from 'react';
import { Flag, Link2, Maximize2, Mic, MicOff, Minimize2, MoreHorizontal, PhoneOff, Video, VideoOff, Volume2 } from 'lucide-react';
import { formatDuration, initialsOf, type CallType } from '@/lib/zego';

interface Props {
  name: string;
  type: CallType;
  /** When the other person joined (ms). Null while still connecting. */
  since: number | null;
  minimized: boolean;
  muted: boolean;
  cameraOff: boolean;
  speaker: { canSwitch: boolean; loud: boolean; toggle: () => void };
  onMute: () => void;
  onCamera: () => void;
  onEnd: () => void;
  onMinimize: () => void;
  onExpand: () => void;
  /** Uploads call logs to ZEGO and saves a report for the admin. */
  onReport: () => void;
  onCopyId: () => void;
}

function useElapsed(since: number | null) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!since) { setSecs(0); return; }
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - since) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [since]);
  return secs;
}

function Ctl({ label, active, disabled, title, onClick, children }: { label: string; active?: boolean; disabled?: boolean; title?: string; onClick: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <button type="button" onClick={onClick} disabled={disabled} title={title} aria-label={label} aria-pressed={active}
        className={`flex h-14 w-14 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-35 ${active ? 'bg-white text-slate-900' : 'bg-white/12 text-white hover:bg-white/20'}`}>
        {children}
      </button>
      <span className="text-xs text-white/80">{label}</span>
    </div>
  );
}

// The screen shown while a call is connected. Voice calls get a calm dark screen with the other person's initials; video calls
// show ZEGO's video full screen behind the same top bar and button panel. "Minimize" shrinks it to a small bar so the person can
// keep using the site while still on the call.
export default function InCallScreen(p: Props) {
  const secs = useElapsed(p.since);
  const [menu, setMenu] = useState(false);
  const video = p.type === 'video';
  const status = p.since ? formatDuration(secs) : 'Connecting…';

  if (p.minimized) {
    return (
      <div role="region" aria-label={`Call with ${p.name}`} style={{ zIndex: 2147483001, top: 'max(0.75rem, env(safe-area-inset-top))' }}
        className="fixed right-3 flex items-center gap-2 rounded-full bg-[#14202a] py-1.5 pl-2 pr-1.5 text-white shadow-xl ring-1 ring-white/15">
        <button type="button" onClick={p.onExpand} aria-label="Open the call screen" className="flex items-center gap-2 rounded-full pr-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2b6f9e] to-[#1d4a70] text-sm font-semibold">{initialsOf(p.name)}</span>
          <span className="max-w-[28vw] truncate text-sm font-medium">{p.name}</span>
          <span className="text-xs tabular-nums text-emerald-300">{status}</span>
          <Maximize2 className="h-3.5 w-3.5 text-white/60" />
        </button>
        <button type="button" onClick={p.onMute} aria-label={p.muted ? 'Unmute' : 'Mute'} aria-pressed={p.muted}
          className={`flex h-9 w-9 items-center justify-center rounded-full ${p.muted ? 'bg-white text-slate-900' : 'bg-white/12'}`}>
          {p.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button type="button" onClick={p.onEnd} aria-label="End call" className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500"><PhoneOff className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`${video ? 'Video' : 'Voice'} call with ${p.name}`} style={{ zIndex: 2147483001 }}
      className={`fixed inset-0 flex flex-col text-white ${video ? 'pointer-events-none' : 'bg-[#0b141a] bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:22px_22px]'}`}>
      <div className={`pointer-events-auto flex items-start justify-between px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] ${video ? 'bg-gradient-to-b from-black/60 to-transparent' : ''}`}>
        <button type="button" onClick={p.onMinimize} aria-label="Minimize the call" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <Minimize2 className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-3 text-center">
          <h2 className="truncate font-heading text-xl font-semibold">{p.name}</h2>
          <p className="mt-0.5 text-sm tabular-nums text-white/70" aria-live="polite">{status}</p>
        </div>
        <span className="h-11 w-11" aria-hidden />
      </div>

      {!video && (
        <div className="flex flex-1 items-center justify-center" aria-hidden>
          <div className="relative flex h-64 w-64 items-center justify-center">
            {!p.since && <span className="absolute inset-0 animate-ping rounded-full bg-white/10 [animation-duration:2.4s]" />}
            <span className="relative flex h-60 w-60 items-center justify-center rounded-full bg-gradient-to-br from-[#2b6f9e] to-[#1d4a70] text-7xl font-semibold shadow-2xl ring-4 ring-white/10">
              {initialsOf(p.name)}
            </span>
          </div>
        </div>
      )}
      {video && <div className="flex-1" />}

      <div className={`pointer-events-auto relative rounded-t-3xl px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 ${video ? 'bg-black/60 backdrop-blur-md' : 'bg-[#18232b]'}`}>
        {menu && (
          <div role="menu" className="absolute bottom-full right-6 mb-2 w-64 overflow-hidden rounded-2xl bg-[#222f38] py-1 text-sm shadow-xl ring-1 ring-white/10">
            <button role="menuitem" type="button" onClick={() => { setMenu(false); p.onReport(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10">
              <Flag className="h-4 w-4" /> Report a problem with this call
            </button>
            <button role="menuitem" type="button" onClick={() => { setMenu(false); p.onCopyId(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/10">
              <Link2 className="h-4 w-4" /> Copy call ID
            </button>
          </div>
        )}
        <div className="mx-auto grid max-w-sm grid-cols-3 gap-x-4 gap-y-6">
          <Ctl label="Speaker" active={p.speaker.loud} disabled={!p.speaker.canSwitch && !video}
            title={!p.speaker.canSwitch && !video ? 'This device chooses the speaker for you' : undefined} onClick={p.speaker.toggle}>
            <Volume2 className="h-6 w-6" />
          </Ctl>
          <Ctl label="Video" active={video && p.cameraOff} disabled={!video} title={!video ? 'This is a voice call. Start a video call from the chat.' : undefined} onClick={p.onCamera}>
            {video && p.cameraOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
          </Ctl>
          <Ctl label="Mute" active={p.muted} onClick={p.onMute}>
            {p.muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </Ctl>
          <Ctl label="More" active={menu} onClick={() => setMenu((v) => !v)}><MoreHorizontal className="h-6 w-6" /></Ctl>
          <Ctl label="Minimize" onClick={p.onMinimize}><Minimize2 className="h-6 w-6" /></Ctl>
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={p.onEnd} aria-label="End call" className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 shadow-lg transition hover:bg-red-600 active:scale-95">
              <PhoneOff className="h-6 w-6" />
            </button>
            <span className="text-xs text-white/80">End</span>
          </div>
        </div>
      </div>
    </div>
  );
}
