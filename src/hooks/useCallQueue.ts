import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { JoinResult, QueueEntry } from '@/lib/calls/callQueue';

const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args) as Promise<{ data: any; error: { message: string } | null }>;

export async function joinCallQueue(calleeUserId: string, type: 'voice' | 'video'): Promise<JoinResult | null> {
  const { data, error } = await rpc('join_call_queue', { _callee: calleeUserId, _type: type });
  return error ? null : (data as JoinResult);      // null = queue not available (for example the migration has not been run): the caller falls back
}
export const leaveCallQueue = async (id: string) => { await rpc('leave_call_queue', { _id: id }); };
export const beginQueueOffer = async (id: string) => { const { data, error } = await rpc('begin_queue_offer', { _id: id }); if (error) throw new Error(error.message); return data as { callee_id: string; call_type: 'voice' | 'video'; store_name: string | null }; };
export const completeQueueOffer = async (id: string) => { await rpc('complete_queue_offer', { _id: id }); };

/** The signed-in buyer's waiting entries. Live through Realtime for the buyer's own rows; a light 15 s refresh only while waiting (for places ahead). */
export function useMyCallQueue() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const refresh = useCallback(async () => {
    if (!user) { setEntries([]); return; }
    const { data, error } = await rpc('my_call_queue');
    if (!error && Array.isArray(data)) setEntries(data as QueueEntry[]);
  }, [user]);
  useEffect(() => {
    if (!user) { setEntries([]); return; }
    void refresh();
    const channel = supabase.channel(`call-queue-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_queue', filter: `caller_id=eq.${user.id}` }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, refresh]);
  // Positions change when someone AHEAD leaves (a row the buyer cannot see), so while waiting, check every 15 seconds.
  const waiting = entries.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => { void refresh(); }, 15_000);
    return () => window.clearInterval(t);
  }, [waiting, refresh]);
  return { entries, refresh };
}
