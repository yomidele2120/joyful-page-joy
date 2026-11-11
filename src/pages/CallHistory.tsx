import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useCalls } from '@/contexts/CallContext';
import { supabase } from '@/integrations/supabase/client';
import { describeCall, formatCallTime, type CallHistoryRow } from '@/lib/callHistory';
import { initialsOf } from '@/lib/zego';

// Every call the signed-in member made or received: incoming, outgoing and missed.
export default function CallHistory() {
  const { user, loading } = useAuth();
  const { available, startCall } = useCalls();
  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['call-history', user?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('my_call_history', { _limit: 100 });
      if (error) throw error;
      return (data ?? []) as CallHistoryRow[];
    },
    enabled: !!user,
    refetchOnWindowFocus: true,
  });

  if (loading) return <Layout><div className="container py-16 text-center text-muted-foreground">Loading...</div></Layout>;
  if (!user) {
    return <Layout><div className="container py-16 text-center"><Phone className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" /><p className="mb-4 text-muted-foreground">Sign in to see your calls.</p><Link to="/auth"><Button>Sign in</Button></Link></div></Layout>;
  }
  const rows = (data ?? []).filter(r => filter === 'all' || describeCall(r).missed);

  return (
    <Layout>
      <div className="container max-w-2xl py-6">
        <h1 className="font-heading text-2xl font-bold">Calls</h1>
        <div className="mt-4 inline-flex rounded-lg border border-border p-0.5 text-sm" role="tablist">
          {(['all', 'missed'] as const).map(f => (
            <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
              className={`rounded-md px-4 py-1.5 capitalize ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{f}</button>
          ))}
        </div>
        {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading...</p>}
        {isError && <p className="py-10 text-center text-sm text-destructive">Could not load your calls. Run the latest database update, then try again.</p>}
        {!isLoading && !isError && !rows.length && <p className="mt-6 rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">{filter === 'missed' ? 'No missed calls.' : 'No calls yet. Start one from a chat with a supplier.'}</p>}
        <ul className="mt-4 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {rows.map(r => {
            const d = describeCall(r);
            const Icon = d.missed ? PhoneMissed : r.direction === 'incoming' ? PhoneIncoming : PhoneOutgoing;
            return (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">{initialsOf(r.peer_name)}</span>
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm font-medium ${d.missed ? 'text-destructive' : ''}`}>{r.peer_name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Icon className={`h-3.5 w-3.5 ${d.tone === 'bad' ? 'text-destructive' : d.tone === 'ok' ? 'text-green-600' : ''}`} />
                    {r.call_type === 'video' ? 'Video' : 'Voice'} · {d.label} · {formatCallTime(r.created_at)}
                  </p>
                </div>
                <Button size="icon" variant="ghost" className="h-9 w-9" disabled={!available} aria-label={`Voice call ${r.peer_name}`} onClick={() => void startCall(r.peer_id, r.peer_name, 'voice')}><Phone className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-9 w-9" disabled={!available} aria-label={`Video call ${r.peer_name}`} onClick={() => void startCall(r.peer_id, r.peer_name, 'video')}><Video className="h-4 w-4" /></Button>
                <Link to={`/messages?vendor=${r.peer_id}`} aria-label={`Message ${r.peer_name}`}><Button size="icon" variant="ghost" className="h-9 w-9"><MessageSquare className="h-4 w-4" /></Button></Link>
              </li>
            );
          })}
        </ul>
        {!available && <p className="mt-3 text-xs text-muted-foreground">Call buttons turn on once calling has connected.</p>}
      </div>
    </Layout>
  );
}
