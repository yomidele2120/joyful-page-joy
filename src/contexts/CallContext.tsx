import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCallsEnabled } from '@/hooks/useCallsEnabled';
import { sendMessage } from '@/hooks/useChat';
import CallScreen from '@/components/calls/CallScreen';
import InCallScreen from '@/components/calls/InCallScreen';
import { useSpeaker } from '@/hooks/useSpeaker';
import { hasCamera, hasMicrophone, installMediaCapture, resetLocalMedia, setCameraOff, setMicMuted } from '@/lib/localMedia';
import { joinCallTabElection } from '@/lib/tabLeader';
import CallAlertsPrompt from '@/components/calls/CallAlertsPrompt';
import { primeRingtone, startRingtone, stopRingtone } from '@/lib/ringtone';
import { inviteWithRetry, isNotLoggedInError, sendWhenLoggedIn } from '@/lib/callRetry';
import { sendCallAlert } from '@/lib/callPush';
import { callMessage, fromZegoUserId, isGenuineIncomingCall, outcomeForEnd, toZegoUserId, type CallOutcome, type CallType } from '@/lib/zego';

// Voice/video calls with ZEGOCLOUD Call Kit. The libraries are loaded only when a signed-in member opens the site
// AND the admin has switched calling on, so everyone else downloads nothing extra.
// Rules live in the database (start_call). The receiving browser double-checks that a real call row exists.

interface CallApi {
  /** True once ZEGO has signed this member in and calls can be placed. */
  available: boolean;
  startCall: (peerUserId: string, peerName: string, type: CallType) => Promise<void>;
}
const Ctx = createContext<CallApi>({ available: false, startCall: async () => {} });
export const useCalls = () => useContext(Ctx);

interface Active {
  role: 'caller' | 'callee'; callId?: string; peerUserId?: string; peerName: string; type: CallType; conversationId?: string; closed?: boolean;
  startedAt: number; joined?: boolean; abort?: boolean;
}
interface Incoming { callerName: string; type: CallType; accept: () => void; refuse: () => void }
interface Outgoing { name: string; type: CallType; cancel: () => void; note?: string }

const LOGIN_WAIT_TRIES = 20;                       // ZEGO signs in a moment after it starts; wait up to about 10 seconds
const LOGIN_WAIT_MS = 1000;
const RENEW_MS = 20 * 60 * 60 * 1000;   // tokens last 24h; sign in again well before that
const RING_LIMIT_MS = 65_000;           // ZEGO stops ringing after 60s; never leave a ringing screen up longer than this
const UNCONNECTED_LIMIT_MS = 90_000;
const OFFLINE_RING_MS = 40_000;         // keep ringing someone who is not on the site this long, alerting them and retrying
const OFFLINE_RETRY_MS = 5_000;    // a call that has not connected after this long is treated as dead
const db = supabase as any;
const zegoErrorText = (e: any) => {
  const code = e?.code ?? e?.errorCode ?? e?.ret;
  const msg = e?.message ?? e?.msg ?? (typeof e === 'string' ? e : '');
  return [code, msg].filter(Boolean).join(' ').slice(0, 120);
};
const reportFailure = (callId: string | undefined, peer: string | undefined, side: 'caller' | 'callee', stage: string, err: unknown) => {
  const text = typeof err === 'string' ? err : (zegoErrorText(err) || String((err as any)?.message ?? ''));
  void db.rpc('log_call_failure', { _call: callId ?? null, _peer: peer ?? null, _side: side, _stage: stage, _error: text, _device: navigator.userAgent.slice(0, 200) }).then((r: any) => { if (r?.error) console.warn('Could not save the call failure log (is the failed-call SQL run?)', r.error.message); }, () => {});
};
// Zego support asks for the SDK logs of a failed call. The Web SDK cannot save a log file, so it is uploaded to Zego at the moment of failure.
const uploadZegoLogs = async (k: { zp: any; ZIM: any } | null): Promise<string> => {
  const at = new Date().toISOString();
  const done: string[] = [];
  try { const z = k?.ZIM?.getInstance?.(); if (z?.uploadLog) { await z.uploadLog(); done.push('ZIM'); } } catch (e) { console.warn('ZIM uploadLog failed', e); }
  try {
    const x = k?.zp?.express ?? k?.zp?.zegoExpressEngine ?? k?.zp?.zg ?? null;
    if (x?.uploadLog) { await x.uploadLog(); done.push('Express'); }
  } catch (e) { console.warn('Express uploadLog failed', e); }
  return `logs uploaded at ${at} (${Intl.DateTimeFormat().resolvedOptions().timeZone}): ${done.join(' + ') || 'none'}`;
};
// If ZEGO still says "not logged in" after waiting, sign in to its messaging service (ZIM) ourselves. This either fixes it or
// returns ZEGO's real reason (for example the In-app Chat service is not enabled for the AppID, or the token is rejected).
const forceZimLogin = async (k: { ZIM: any; login: { userId: string; userName: string; token: string } }): Promise<string | null> => {
  try {
    const zi = k.ZIM?.getInstance?.();
    if (!zi) return 'ZIM instance was never created';
    await zi.login(k.login.userId, { userName: k.login.userName, token: k.login.token });
    return null;
  } catch (err: any) {
    if (err?.code === 6000111 || /6000111|already logged in/i.test(String(err?.message ?? err))) return null;   // already signed in: that is fine
    const text = `${err?.code ?? ''} ${err?.message ?? err}`.trim();
    console.warn('ZIM login failed', err);
    return text;
  }
};
const errText = (e: any) => String(e?.message ?? e ?? 'Something went wrong').replace(/^.*?:\s*/, '');

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: enabled } = useCallsEnabled();
  const kit = useRef<{ zp: any; Kit: any; ZIM: any; login: { userId: string; userName: string; token: string } } | null>(null);
  const active = useRef<Active | null>(null);
  const ringGen = useRef(0);                          // bumps whenever a ringing call ends, so a slow check never shows a call that is already over
  const ringTimer = useRef<number | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [bootKey, setBootKey] = useState(0);              // bumping this rebuilds the ZEGO connection from scratch
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);
  const [roomType, setRoomType] = useState<CallType | null>(null);   // set while this person is inside a call room (shows the speaker control)
  const [minimized, setMinimized] = useState(false);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOffState] = useState(false);
  const [since, setSince] = useState<number | null>(null);       // when the other person joined: the call timer starts here
  const [roomPeer, setRoomPeer] = useState('');
  const [isCallTab, setIsCallTab] = useState(false);              // only one tab per person stays signed in to ZEGO (see lib/tabLeader.ts)
  const [kicked, setKicked] = useState(false);                   // signed in to calls on another device, which pushed this one out
  const host = useRef<HTMLDivElement | null>(null);              // where ZEGO draws the call room, so we can place it ourselves
  const meId = user?.id;

  // Report the end of a call once. The caller also leaves a line in the chat ("Voice call · 1:35", "Missed video call").
  const closeCall = useCallback(async (outcome: CallOutcome) => {
    setRoomType(null); setMinimized(false); setMuted(false); setCameraOffState(false); setSince(null); setRoomPeer(''); resetLocalMedia();
    const a = active.current;
    if (!a || a.closed) return;
    a.closed = true; active.current = null; setOutgoing(null);
    if (!a.callId) return;
    await db.rpc('finish_call', { _call: a.callId, _outcome: outcome });
    if (outcome === 'failed') return;      // a technical failure is not something to leave in the chat
    if (a.role !== 'caller' || !meId || !a.peerUserId || !a.conversationId) return;
    const { data: row } = await db.from('call_logs').select('status, duration_seconds').eq('id', a.callId).maybeSingle();
    if (row) await sendMessage(a.conversationId, meId, a.peerUserId, callMessage(a.type, row.status, row.duration_seconds));
  }, [meId]);

  const markAnswered = useCallback(() => {
    const a = active.current;
    if (!a) return;
    a.joined = true;
    setSince((t) => t ?? Date.now());
    if (a.callId && !a.closed) void db.rpc('finish_call', { _call: a.callId, _outcome: 'answered' });
  }, []);

  // True while a call is really in progress. A call that never connected (for example the microphone was refused) must
  // not block every later call, so it is treated as dead after a short time.
  const isBusy = useCallback(() => {
    const a = active.current;
    if (!a) return false;
    if (!a.joined && Date.now() - a.startedAt > UNCONNECTED_LIMIT_MS) { active.current = null; return false; }
    return true;
  }, []);

  const clearRingTimer = useCallback(() => {
    if (ringTimer.current !== undefined) { window.clearTimeout(ringTimer.current); ringTimer.current = undefined; }
  }, []);

  useEffect(() => {
    if (!meId || enabled !== true || !isCallTab || kicked) return;
    let cancelled = false;
    let renew: number | undefined;
    let current: any = null;

    const boot = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('zego-token', { body: {} });
        if (error || !data?.token) throw new Error(error?.message || data?.error || 'no token');
        const [kitMod, zimMod] = await Promise.all([import('@zegocloud/zego-uikit-prebuilt'), import('zego-zim-web')]);
        if (cancelled) return;
        const Kit = (kitMod as any).ZegoUIKitPrebuilt;
        const ZIM = (zimMod as any).ZIM ?? (zimMod as any).default;
        const kitToken = Kit.generateKitTokenForProduction(data.appId, data.token, null, data.userId, data.userName);
        const zp = Kit.create(kitToken);
        zp.addPlugins({ ZIM });
        zp.setCallInvitationConfig({
          enableCustomCallInvitationDialog: true,
          enableCustomCallInvitationWaitingPage: true,
          endCallWhenInitiatorLeave: true,
          onConfirmDialogWhenReceiving: (callType: number, caller: { userID: string; userName?: string }, refuse: () => void, accept: () => void, extra: string) => {
            void (async () => {
              const type: CallType = callType === Kit.InvitationTypeVideoCall ? 'video' : 'voice';
              console.info('Incoming call invitation received', { from: caller?.userID, extra });
              let rcvId: string | undefined;
              try { rcvId = JSON.parse(extra || '{}')?.callId; } catch { /* no data */ }
              reportFailure(rcvId, fromZegoUserId(caller.userID) ?? undefined, 'callee', 'info_invitation_received', 'This device received the invitation (diagnostic row, not a failure)');
              if (isBusy()) {
                reportFailure(rcvId, fromZegoUserId(caller.userID) ?? undefined, 'callee', 'refused_busy', `device thought a call was already in progress (role=${active.current?.role} joined=${active.current?.joined})`);
                refuse(); return;                                               // already on a call
              }
              const gen = ringGen.current;
              let callId: string | undefined;
              try { callId = JSON.parse(extra || '{}')?.callId; } catch { /* no data */ }
              let info: any = null;
              if (callId && /^[0-9a-f-]{36}$/i.test(callId)) {
                // A passing network or sign-in hiccup must not silently kill a real call: look the record up up to 3 times.
                for (let i = 0; i < 3 && !info; i++) {
                  const res = await db.rpc('incoming_call_info', { _call: callId });
                  info = res.data ?? null;
                  if (!info && i < 2) await new Promise((r) => window.setTimeout(r, 700));
                }
              }
              if (gen !== ringGen.current) return;                              // the caller already hung up while we were checking
              // No matching, fresh call record means it did not go through start_call (rules and limits): do not ring.
              if (!isGenuineIncomingCall(info, { me: meId, callerZegoId: caller.userID })) {
                reportFailure(callId, fromZegoUserId(caller.userID) ?? undefined, 'callee', info ? 'incoming_check_failed' : 'incoming_lookup_empty', `callId=${callId ?? 'none'} info=${info ? JSON.stringify(info) : 'null'}`);
                console.warn('Incoming call not shown', { callId, hasInfo: !!info, info, callerZegoId: caller.userID, me: meId });
                refuse(); return;
              }
              const a: Active = { role: 'callee', callId, peerName: caller.userName || 'Someone', type, startedAt: Date.now() };
              active.current = a;
              clearRingTimer();
              ringTimer.current = window.setTimeout(() => {                     // safety net: never leave a ringing screen stuck on
                setIncoming(null);
                if (active.current === a && !a.joined) active.current = null;
              }, RING_LIMIT_MS);
              setIncoming({
                callerName: a.peerName, type,
                accept: () => { clearRingTimer(); setIncoming(null); accept(); },
                refuse: () => { clearRingTimer(); setIncoming(null); refuse(); void closeCall('declined'); },
              });
            })();
          },
          onWaitingPageWhenSending: (callType: number, _callees: unknown, cancel: () => void) => {
            const a = active.current;
            if (!a || a.role !== 'caller') return;
            setOutgoing((o) => ({
              name: a.peerName, type: callType === Kit.InvitationTypeVideoCall ? 'video' : 'voice', note: o?.note,
              cancel: () => { a.abort = true; setOutgoing(null); try { cancel(); } catch { /* nothing to cancel yet */ } void closeCall('cancelled'); },
            }));
          },
          onSetRoomConfigBeforeJoining: (callType: number) => {
            setOutgoing(null);                                                    // the other person accepted: leave the ringing screen
            const video = callType === Kit.InvitationTypeVideoCall;
            setRoomType(video ? 'video' : 'voice');
            setRoomPeer(active.current?.peerName || '');
            return {
              // ZEGO draws the room inside our own element, and its built-in buttons are hidden: our InCallScreen has the buttons.
              container: host.current ?? undefined,
              turnOnCameraWhenJoining: video, turnOnMicrophoneWhenJoining: true,
              showMyCameraToggleButton: false, showMyMicrophoneToggleButton: false, showAudioVideoSettingsButton: false,
              showScreenSharingButton: false, showTextChat: false, showUserList: false, maxUsers: 2,
              showLeaveRoomConfirmDialog: false, showRoomTimer: false,
              showLayoutButton: false, showPinButton: false, lowerLeftNotification: { showUserJoinAndLeave: false, showTextChat: false },
              onJoinRoom: () => { if (active.current?.role === 'callee') markAnswered(); },   // the callee joins only after accepting
              onUserJoin: () => { if (active.current?.role === 'caller') markAnswered(); },   // the caller counts as answered when the other person arrives
              onLeaveRoom: () => { void closeCall('ended'); },
            };
          },
          onCallInvitationEnded: (reason: string) => {
            console.info('Call invitation ended', reason);
            ringGen.current++; clearRingTimer();
            setIncoming(null); setOutgoing(null); setRoomType(null);                                // cancelled, declined or timed out while ringing
            const a = active.current;
            if (!a) return;
            if (a.role === 'caller' && !a.joined && !a.closed) reportFailure(a.callId, a.peerUserId, 'caller', 'unanswered_after_send', `invitation was sent but ended with reason "${reason}" without the callee joining`);
            if (a.role === 'caller' || reason === 'LeaveRoom') void closeCall(outcomeForEnd(reason));
            else active.current = null;
          },
        });
        // Record every change of the messaging connection. ZIM allows one sign-in per user: a second tab or phone signed in as the
        // same person kicks the first one out (event 4 = kicked out), which makes calls to that person silently fail.
        // ZIM is created a moment after addPlugins, so wait for it before listening (up to 15 seconds).
        {
          let tries = 0;
          let zimConnected = false;
          const attach = () => {
            if (cancelled) return;
            let zi: any = null;
            try { zi = ZIM?.getInstance?.(); } catch { /* not created yet */ }
            if (!zi) { if (++tries < 30) window.setTimeout(attach, 500); else console.warn('ZIM instance was never created: the call plugin did not start'); return; }
            console.info('ZIM instance ready');
            // Everyone must be signed in to ZEGO messaging while the site is open, or calls to them never ring. If the kit has not
            // managed it a few seconds after loading (or the connection drops), sign in directly and record why if that fails too.
            const signIn = async (why: string) => {
              if (cancelled || zimConnected) return;
              const err = await forceZimLogin({ ZIM, login: { userId: data.userId, userName: data.userName, token: data.token } });
              if (err) reportFailure(undefined, undefined, 'callee', 'zim_login_failed_' + why, err);
              else console.info('ZIM signed in directly (' + why + ')');
            };
            window.setTimeout(() => void signIn('on_load'), 4000);
            try {
              zi.on?.('connectionStateChanged', (_z: unknown, r: { state?: number; event?: number }) => {
                console.info('ZIM connection', r);      // state 0 disconnected, 1 connecting, 2 connected, 3 reconnecting
                zimConnected = r?.state === 2;
                if (r?.state === 0 && r?.event === 4) { setKicked(true); toast.info('Calls moved to another device or window where you are signed in.'); }
                if (r?.state === 0 && r?.event !== 4) window.setTimeout(() => void signIn('after_disconnect'), 2000);
                if (r?.state === 0) reportFailure(undefined, undefined, 'caller', 'zim_disconnected', `state=${r.state} event=${r.event} (event 4 = signed in on another tab or device)`);
              });
              zi.on?.('error', (_z: unknown, e: { code?: number; message?: string }) => {
                console.warn('ZIM error', e);
                reportFailure(undefined, undefined, 'caller', 'zim_error', `${e?.code ?? ''} ${e?.message ?? ''}`);
              });
            } catch { /* diagnostics only */ }
          };
          attach();
        }
        current = zp;
        kit.current = { zp, Kit, ZIM, login: { userId: data.userId, userName: data.userName, token: data.token } };
        setReady(true);
        const scheduleRenew = (ms: number) => {
          renew = window.setTimeout(() => {
            if (cancelled) return;
            if (active.current) { scheduleRenew(5 * 60 * 1000); return; }      // never cut off a call in progress
            try { zp.destroy?.(); } catch { /* ignore */ }
            kit.current = null; setReady(false); void boot();
          }, ms);
        };
        scheduleRenew(RENEW_MS);
      } catch (e) {
        console.warn('Calling is not available', e);
        reportFailure(undefined, undefined, 'caller', 'calling_not_available', e);
        if (!cancelled) setReady(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
      if (renew) window.clearTimeout(renew);
      try { current?.destroy?.(); } catch { /* ignore */ }
      clearRingTimer();
      kit.current = null; active.current = null; setReady(false); setIncoming(null); setOutgoing(null); setRoomType(null);
    };
  }, [meId, enabled, bootKey, isCallTab, kicked, closeCall, markAnswered, isBusy, clearRingTimer]);

  const startCall = useCallback(async (peerUserId: string, peerName: string, type: CallType) => {
    const k = kit.current;
    if (!meId) { toast.error('Sign in to make a call'); return; }
    if (kicked) { setKicked(false); toast.info('Reconnecting calls on this device. Try again in a few seconds.'); return; }
    if (!isCallTab) { toast.error('Calls are open in another tab of this site. Switch to that tab, or close it, and try again.'); return; }
    if (!k) { toast.error('Calling is still connecting. Try again in a few seconds.'); return; }
    if (isBusy()) { toast.error('You are already on a call'); return; }
    primeRingtone();                       // inside the tap, so the phone allows the ring-back tone a moment later
    const { data: callId, error } = await db.rpc('start_call', { _peer: peerUserId, _type: type });
    if (error || !callId) { reportFailure(undefined, peerUserId, 'caller', 'start_call', errText(error)); toast.error(errText(error) || 'Could not start the call'); return; }
    const { data: row } = await db.from('call_logs').select('conversation_id').eq('id', callId).maybeSingle();
    const a: Active = { role: 'caller', callId, peerUserId, peerName, type, conversationId: row?.conversation_id, startedAt: Date.now() };
    active.current = a;
    // Show "Calling..." and start the ring-back tone right away. ZEGO's own waiting page takes over once it is ready.
    setOutgoing({ name: peerName, type, cancel: () => { a.abort = true; void closeCall('cancelled'); } });
    const invite = () => k.zp.sendCallInvitation({
      callees: [{ userID: toZegoUserId(peerUserId), userName: peerName }],
      callType: type === 'video' ? k.Kit.InvitationTypeVideoCall : k.Kit.InvitationTypeVoiceCall,
      timeout: 60,
      data: JSON.stringify({ callId }),
    });
    try {
      // If the other person's site is closed, ZEGO cannot reach them. Send a call alert to their phone or computer, keep ringing
      // here, and keep trying: the moment they open the site, the call rings on their screen.
      const outcome = await inviteWithRetry({
        // ZEGO signs in a moment after it starts: if it says so, wait a few seconds and send again.
        send: async () => {
          const wait = (tries: number) => sendWhenLoggedIn({ send: invite, isAborted: () => a.abort === true || active.current !== a, tries, intervalMs: LOGIN_WAIT_MS });
          try { return await wait(LOGIN_WAIT_TRIES); }
          catch (e) {
            if (!isNotLoggedInError(e)) throw e;
            const loginError = await forceZimLogin(k);
            if (loginError) { reportFailure(callId, peerUserId, 'caller', 'zim_login_failed', loginError); throw e; }
            return await wait(10);
          }
        },
        isAborted: () => a.abort === true || active.current !== a,
        onOffline: () => {
          reportFailure(callId, peerUserId, 'caller', 'callee_not_connected_to_zego', 'ZEGO could not reach the callee: they are not signed in to ZEGO messaging (site closed, signed in elsewhere, or their connection failed)');
          setOutgoing((o) => (o ? { ...o, note: `${peerName} is not on the site right now. Still ringing…` } : o));
          void sendCallAlert(callId).then((sent) => {
            if (sent > 0) setOutgoing((o) => (o ? { ...o, note: `${peerName} is not on the site. We sent them a call alert. Still ringing…` } : o));
          });
        },
        intervalMs: OFFLINE_RETRY_MS, totalMs: OFFLINE_RING_MS,
      });
      if (outcome === 'timeout') {
        reportFailure(callId, peerUserId, 'caller', 'ring_timeout', 'callee never received or answered the invitation');
        toast.error(`${peerName} did not pick up. They will see your missed call in the chat.`);
        await closeCall('missed');
      }
    } catch (e) {
      console.error('ZEGO sendCallInvitation failed', e);
      void uploadZegoLogs(k).then((up) => reportFailure(callId, peerUserId, 'caller', isNotLoggedInError(e) ? 'zego_not_logged_in' : 'send_invitation', `${zegoErrorText(e)} | ${up}`));
      if (isNotLoggedInError(e)) {
        // Still not signed in after waiting: the connection was lost (a phone waking up, bad network). Build it again.
        toast.error('Calling lost its connection and is reconnecting. Try again in a few seconds.');
        setBootKey((n) => n + 1);
      } else {
        const detail = zegoErrorText(e);
        toast.error(`Could not place the call${detail ? ` (${detail})` : ''}. Please try again.`);
      }
      await closeCall('failed');
    }
  }, [meId, kicked, isCallTab, closeCall, isBusy]);

  // The element ZEGO draws the call room into, and the one-call-tab rule. Microphone and camera control starts watching right away.
  useEffect(() => {
    installMediaCapture();
    const el = document.createElement('div');
    el.setAttribute('data-call-room', '');
    document.body.appendChild(el);
    host.current = el;
    return () => { el.remove(); host.current = null; };
  }, []);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const show = roomType === 'video' && !minimized;     // video fills the screen behind our buttons; voice and minimized stay off screen but keep playing sound
    el.style.position = 'fixed';
    el.style.zIndex = show ? '2147483000' : '-1';
    if (show) { el.style.inset = '0'; el.style.left = ''; el.style.top = ''; el.style.width = '100%'; el.style.height = '100%'; }
    else { el.style.inset = ''; el.style.left = '-10000px'; el.style.top = '0'; el.style.width = '360px'; el.style.height = '640px'; }
  }, [roomType, minimized]);
  useEffect(() => {
    if (!meId || enabled !== true) { setIsCallTab(false); return; }
    const election = joinCallTabElection(meId, setIsCallTab, () => !active.current);
    return () => election.stop();
  }, [meId, enabled]);

  const speaker = useSpeaker(roomType ?? 'voice', !!roomType);
  const toggleMute = useCallback(() => {
    const next = !muted;
    const changed = setMicMuted(next);
    if (next && changed === 0) { setMicMuted(false); toast.error('Could not reach the microphone to mute it.'); return; }
    setMuted(next);
  }, [muted]);
  const toggleCamera = useCallback(() => {
    const next = !cameraOff;
    const changed = setCameraOff(next);
    if (next && changed === 0) { setCameraOff(false); toast.error('Could not reach the camera to switch it off.'); return; }
    setCameraOffState(next);
  }, [cameraOff]);
  const hangUp = useCallback(async () => {
    const k = kit.current;
    let hung = false;
    try { if (typeof k?.zp?.hangUp === 'function') { k.zp.hangUp(); hung = true; } } catch (e) { console.warn('hangUp failed', e); }
    await closeCall('ended');
    if (!hung) {                       // no hang-up available in this ZEGO version: leave the room by rebuilding the connection
      try { k?.zp?.destroy?.(); } catch { /* already gone */ }
      kit.current = null; setReady(false); setBootKey((n) => n + 1);
    }
  }, [closeCall]);
  const sendReport = useCallback(async () => {
    const a = active.current;
    toast.info('Sending the call report…');
    const up = await uploadZegoLogs(kit.current);
    reportFailure(a?.callId, a?.peerUserId, a?.role === 'callee' ? 'callee' : 'caller', 'user_report', `Reported from the call screen. ${up}`);
    toast.success('Report sent. Thank you.');
  }, []);
  const copyId = useCallback(() => {
    const id = active.current?.callId;
    if (!id) { toast.error('This call has no ID yet.'); return; }
    navigator.clipboard?.writeText(id).then(() => toast.success('Call ID copied'), () => toast.error('Could not copy. Your browser blocked it.'));
  }, []);

  // Ring while a call is ringing in either direction, and stop the moment it is answered, declined or ended.
  const ringing = incoming ? 'incoming' : outgoing ? 'outgoing' : null;
  useEffect(() => {
    if (!ringing) return;
    startRingtone(ringing);
    return () => stopRingtone();
  }, [ringing]);

  const api = useMemo<CallApi>(() => ({ available: ready, startCall }), [ready, startCall]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {incoming && <CallScreen mode="incoming" name={incoming.callerName} type={incoming.type} onAccept={incoming.accept} onEnd={incoming.refuse} />}
      {!incoming && outgoing && <CallScreen mode="outgoing" name={outgoing.name} type={outgoing.type} note={outgoing.note} onEnd={outgoing.cancel} />}
      {ready && <CallAlertsPrompt />}
      {roomType && (
        <InCallScreen name={roomPeer || 'Call'} type={roomType} since={since} minimized={minimized} muted={muted} cameraOff={cameraOff}
          speaker={speaker} onMute={toggleMute} onCamera={toggleCamera} onEnd={() => void hangUp()}
          onMinimize={() => setMinimized(true)} onExpand={() => setMinimized(false)} onReport={() => void sendReport()} onCopyId={copyId} />
      )}
    </Ctx.Provider>
  );
}
