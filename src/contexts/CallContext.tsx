import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCallsEnabled } from '@/hooks/useCallsEnabled';
import { sendMessage } from '@/hooks/useChat';
import CallScreen from '@/components/calls/CallScreen';
import { startRingtone, stopRingtone } from '@/lib/ringtone';
import { callMessage, isGenuineIncomingCall, outcomeForEnd, toZegoUserId, type CallOutcome, type CallRow, type CallType } from '@/lib/zego';

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
}
interface Incoming { callerName: string; type: CallType; accept: () => void; refuse: () => void }
interface Outgoing { name: string; type: CallType; cancel: () => void }

const RENEW_MS = 20 * 60 * 60 * 1000;   // tokens last 24h; sign in again well before that
const db = supabase as any;
const zegoErrorText = (e: any) => {
  const code = e?.code ?? e?.errorCode ?? e?.ret;
  const msg = e?.message ?? e?.msg ?? (typeof e === 'string' ? e : '');
  return [code, msg].filter(Boolean).join(' ').slice(0, 120);
};
const errText = (e: any) => String(e?.message ?? e ?? 'Something went wrong').replace(/^.*?:\s*/, '');

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: enabled } = useCallsEnabled();
  const kit = useRef<{ zp: any; Kit: any } | null>(null);
  const active = useRef<Active | null>(null);
  const [ready, setReady] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [outgoing, setOutgoing] = useState<Outgoing | null>(null);
  const meId = user?.id;

  // Report the end of a call once. The caller also leaves a line in the chat ("Voice call · 1:35", "Missed video call").
  const closeCall = useCallback(async (outcome: CallOutcome) => {
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
    if (a?.callId && !a.closed) void db.rpc('finish_call', { _call: a.callId, _outcome: 'answered' });
  }, []);

  useEffect(() => {
    if (!meId || enabled !== true) return;
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
              if (active.current) { refuse(); return; }                         // already on a call
              let callId: string | undefined;
              try { callId = JSON.parse(extra || '{}')?.callId; } catch { /* no data */ }
              let row: CallRow | null = null;
              if (callId && /^[0-9a-f-]{36}$/i.test(callId)) {
                const res = await db.from('call_logs').select('caller_id, callee_id, call_type, status, ended_at, created_at').eq('id', callId).maybeSingle();
                row = res.data ?? null;
              }
              // No matching row means the call did not go through start_call (rules and limits), so it is not allowed to ring.
              if (!isGenuineIncomingCall(row, { me: meId, callerZegoId: caller.userID })) { refuse(); return; }
              const a: Active = { role: 'callee', callId, peerName: caller.userName || 'Someone', type };
              active.current = a;
              setIncoming({
                callerName: a.peerName, type,
                accept: () => { setIncoming(null); accept(); },
                refuse: () => { setIncoming(null); refuse(); void closeCall('declined'); },
              });
            })();
          },
          onWaitingPageWhenSending: (callType: number, _callees: unknown, cancel: () => void) => {
            const a = active.current;
            if (!a || a.role !== 'caller') return;
            setOutgoing({ name: a.peerName, type: callType === Kit.InvitationTypeVideoCall ? 'video' : 'voice', cancel: () => { setOutgoing(null); cancel(); } });
          },
          onSetRoomConfigBeforeJoining: (callType: number) => {
            setOutgoing(null);                                                    // the other person accepted: leave the ringing screen
            const video = callType === Kit.InvitationTypeVideoCall;
            return {
              turnOnCameraWhenJoining: video, showMyCameraToggleButton: video,
              showScreenSharingButton: false, showTextChat: false, showUserList: false, maxUsers: 2,
              showLayoutButton: false, showPinButton: false, lowerLeftNotification: { showUserJoinAndLeave: false, showTextChat: false },
              onJoinRoom: () => { if (active.current?.role === 'callee') markAnswered(); },   // the callee joins only after accepting
              onUserJoin: () => { if (active.current?.role === 'caller') markAnswered(); },   // the caller counts as answered when the other person arrives
              onLeaveRoom: () => { void closeCall('ended'); },
            };
          },
          onCallInvitationEnded: (reason: string) => {
            setIncoming(null); setOutgoing(null);                                // cancelled, declined or timed out while ringing
            const a = active.current;
            if (!a) return;
            if (a.role === 'caller' || reason === 'LeaveRoom') void closeCall(outcomeForEnd(reason));
            else active.current = null;
          },
        });
        current = zp;
        kit.current = { zp, Kit };
        setReady(true);
        renew = window.setTimeout(() => { try { zp.destroy?.(); } catch { /* ignore */ } kit.current = null; setReady(false); void boot(); }, RENEW_MS);
      } catch (e) {
        console.warn('Calling is not available', e);
        if (!cancelled) setReady(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
      if (renew) window.clearTimeout(renew);
      try { current?.destroy?.(); } catch { /* ignore */ }
      kit.current = null; active.current = null; setReady(false); setIncoming(null); setOutgoing(null);
    };
  }, [meId, enabled, closeCall, markAnswered]);

  const startCall = useCallback(async (peerUserId: string, peerName: string, type: CallType) => {
    const k = kit.current;
    if (!meId) { toast.error('Sign in to make a call'); return; }
    if (!k) { toast.error('Calling is still connecting. Try again in a few seconds.'); return; }
    if (active.current) { toast.error('You are already on a call'); return; }
    const { data: callId, error } = await db.rpc('start_call', { _peer: peerUserId, _type: type });
    if (error || !callId) { toast.error(errText(error) || 'Could not start the call'); return; }
    const { data: row } = await db.from('call_logs').select('conversation_id').eq('id', callId).maybeSingle();
    active.current = { role: 'caller', callId, peerUserId, peerName, type, conversationId: row?.conversation_id };
    try {
      const res = await k.zp.sendCallInvitation({
        callees: [{ userID: toZegoUserId(peerUserId), userName: peerName }],
        callType: type === 'video' ? k.Kit.InvitationTypeVideoCall : k.Kit.InvitationTypeVoiceCall,
        timeout: 60,
        data: JSON.stringify({ callId }),
      });
      if (res?.errorInvitees?.length) {
        // They are not signed in to calling right now (site closed). Leave a missed-call line so they see it later.
        toast.error(`${peerName} is not online right now. They will see your missed call in the chat.`);
        await closeCall('missed');
      }
    } catch (e) {
      console.error('ZEGO sendCallInvitation failed', e);
      const detail = zegoErrorText(e);
      toast.error(`Could not place the call${detail ? ` (${detail})` : ''}. Please try again.`);
      await closeCall('failed');
    }
  }, [meId, closeCall]);

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
      {!incoming && outgoing && <CallScreen mode="outgoing" name={outgoing.name} type={outgoing.type} onEnd={outgoing.cancel} />}
    </Ctx.Provider>
  );
}
