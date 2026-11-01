import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Check, Loader2, Play, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { functionErrorMessage } from '@/lib/functionError';
import { cn } from '@/lib/utils';

// Vendor dashboard panel: connect your TikTok account, choose which of your TikTok videos appear in your shop and the feed.
// All TikTok work happens in the "tiktok" edge function; the browser never sees TikTok tokens.

interface Connection { auto_import: boolean; display_name: string | null; avatar_url: string | null; last_synced_at: string | null; needs_reconnect: boolean; last_error: string | null }
interface TTVideo { id: string; title: string; duration: number | null; cover_image_url: string | null; share_url: string | null; create_time: number | null; selected: boolean }

async function call<T = any>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tiktok', { body });
  if (error || data?.error) throw new Error(await functionErrorMessage(error, data));
  return data as T;
}

export default function TikTokConnect({ vendorId, switchedOn = true }: { vendorId: string; switchedOn?: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<'start' | 'sync' | 'disconnect' | 'auto' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const { data: conn, isLoading } = useQuery({
    queryKey: ['tiktok-connection', vendorId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('vendor_tiktok_connections')
        .select('auto_import, display_name, avatar_url, last_synced_at, needs_reconnect, last_error').eq('vendor_id', vendorId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Connection | null;
    },
  });

  const refreshPosts = () => {
    queryClient.invalidateQueries({ queryKey: ['tiktok-connection', vendorId] });
    queryClient.invalidateQueries({ queryKey: ['vendor-posts'] });
    queryClient.invalidateQueries({ queryKey: ['posts-feed'] });
  };

  const connect = async () => {
    setBusy('start');
    try { const { url } = await call<{ url: string }>({ action: 'start' }); window.location.assign(url); }
    catch (e: any) { toast.error(e.message || 'Could not start the TikTok connection.'); setBusy(null); }
  };
  const sync = async () => {
    setBusy('sync');
    try { const r = await call<{ updated: number; removed: number }>({ action: 'sync' }); toast.success(r.removed ? `Updated. ${r.removed} video(s) no longer on TikTok were removed.` : 'Your TikTok videos are up to date.'); refreshPosts(); }
    catch (e: any) { toast.error(e.message || 'Could not refresh.'); refreshPosts(); }
    finally { setBusy(null); }
  };
  const setAuto = async (enabled: boolean) => {
    setBusy('auto');
    try {
      const r = await call<{ added: number }>({ action: 'set_auto', enabled });
      toast.success(enabled ? (r.added ? `Automatic mode is on. ${r.added} recent video(s) were added.` : 'Automatic mode is on. New TikTok videos will appear on their own.') : 'Automatic mode is off. Your chosen videos stay.');
      refreshPosts();
    } catch (e: any) { toast.error(e.message || 'Could not change this setting.'); }
    finally { setBusy(null); }
  };
  const disconnect = async () => {
    setBusy('disconnect');
    try { await call({ action: 'disconnect' }); toast.success('TikTok disconnected. Your TikTok videos were removed from your shop and the feed.'); refreshPosts(); }
    catch (e: any) { toast.error(e.message || 'Could not disconnect.'); }
    finally { setBusy(null); setConfirmDisconnect(false); }
  };

  if (isLoading) return null;
  // Switched off by the admin: nothing new can be connected or chosen. A connected seller can still disconnect.
  if (!switchedOn && !conn) return null;

  return (
    <div className="rounded-lg bg-card p-4 card-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-bold">TikTok</h3>
          {!conn && <p className="mt-0.5 text-sm text-muted-foreground">Connect your business TikTok and choose which of your videos appear in your shop and the feed.</p>}
          {conn && (
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
              {conn.avatar_url && <img src={conn.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" referrerPolicy="no-referrer" />}
              <span className="truncate">Connected as <strong className="text-foreground">{conn.display_name || 'your TikTok account'}</strong></span>
            </p>
          )}
        </div>
        {!conn && switchedOn && <Button size="sm" onClick={connect} disabled={busy === 'start'}>{busy === 'start' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}Connect TikTok</Button>}
      </div>

      {!switchedOn && conn && <p className="mt-3 rounded-md bg-secondary p-2.5 text-sm text-muted-foreground">TikTok is paused for now. Your TikTok videos stay visible, but you cannot add or change them until it is switched back on.</p>}

      {switchedOn && conn?.needs_reconnect && (
        <div className="mt-3 flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Your TikTok connection needs to be renewed. Your videos stay visible, but they will not update until you connect again.</span>
        </div>
      )}

      {conn && (
        <div className="mt-3 flex flex-wrap gap-2">
          {switchedOn && (conn.needs_reconnect
            ? <Button size="sm" onClick={connect} disabled={busy === 'start'}>{busy === 'start' && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Connect again</Button>
            : <Button size="sm" onClick={() => setPickerOpen(true)}>Choose videos</Button>)}
          {switchedOn && (
            <Button size="sm" variant="outline" onClick={sync} disabled={busy !== null || conn.needs_reconnect}>
              {busy === 'sync' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1.5 h-4 w-4" />}Refresh
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}>
            <Unplug className="mr-1.5 h-4 w-4" />Disconnect
          </Button>
        </div>
      )}
      {switchedOn && conn && !conn.needs_reconnect && (
        <label className="mt-3 flex items-start justify-between gap-3 rounded-md border p-3">
          <span className="text-sm">
            <span className="block font-medium">Automatically show new TikTok videos</span>
            <span className="block text-xs text-muted-foreground">New videos you post on TikTok appear in your shop and the feed within about an hour. Videos you remove stay removed.</span>
          </span>
          <Switch checked={conn.auto_import} disabled={busy !== null} onCheckedChange={setAuto} aria-label="Automatically show new TikTok videos" />
        </label>
      )}
      {conn?.last_synced_at && <p className="mt-2 text-xs text-muted-foreground">Last updated {new Date(conn.last_synced_at).toLocaleString()}</p>}

      {pickerOpen && <VideoPicker open={pickerOpen} onClose={() => { setPickerOpen(false); refreshPosts(); }} />}

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect TikTok?</AlertDialogTitle>
            <AlertDialogDescription>Your TikTok videos will be removed from your shop and the feed, along with their likes and comments here. Nothing is deleted on TikTok. You can connect again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); disconnect(); }} disabled={busy === 'disconnect'}>{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Lists the vendor's TikTok videos (newest first); ticked ones are shown in the shop and feed. Saved with one button. */
function VideoPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [videos, setVideos] = useState<TTVideo[]>([]);
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const load = async (next?: number | null) => {
    setLoading(true); setError(null);
    try {
      const r = await call<{ videos: TTVideo[]; cursor: number | null; has_more: boolean }>({ action: 'list', ...(next ? { cursor: next } : {}) });
      setVideos(prev => { const seen = new Set(prev.map(v => v.id)); return [...prev, ...r.videos.filter(v => !seen.has(v.id))]; });
      setInitial(prev => new Set([...prev, ...r.videos.filter(v => v.selected).map(v => v.id)]));
      setPicked(prev => new Set([...prev, ...r.videos.filter(v => v.selected).map(v => v.id)]));
      setCursor(r.cursor); setMore(r.has_more);
    } catch (e: any) { setError(e.message || 'Could not load your TikTok videos.'); }
    finally { setLoading(false); }
  };
  if (!started) { setStarted(true); void load(); }

  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toAdd = [...picked].filter(id => !initial.has(id));
  const toRemove = [...initial].filter(id => !picked.has(id));

  const save = async () => {
    setSaving(true);
    try {
      const chunks = <T,>(a: T[]) => Array.from({ length: Math.ceil(a.length / 20) }, (_, i) => a.slice(i * 20, i * 20 + 20));
      for (const c of chunks(toAdd)) await call({ action: 'select', video_ids: c });
      for (const c of chunks(toRemove)) await call({ action: 'unselect', video_ids: c });
      toast.success('Saved. Your TikTok videos now appear in your shop and the feed.');
      onClose();
    } catch (e: any) { toast.error(e.message || 'Could not save your choice.'); }
    finally { setSaving(false); }
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Choose your TikTok videos</DrawerTitle>
          <DrawerDescription>Tick the videos to show in your shop and the feed. Buyers play them with TikTok's own player.</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-2">
          {error && <p className="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">{error}</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {videos.map(v => (
              <button key={v.id} type="button" onClick={() => toggle(v.id)} aria-pressed={picked.has(v.id)}
                className={cn('relative aspect-[9/16] overflow-hidden rounded-lg bg-muted text-left ring-2 transition', picked.has(v.id) ? 'ring-primary' : 'ring-transparent')}>
                {v.cover_image_url && <img src={v.cover_image_url} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />}
                {picked.has(v.id) && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3.5 w-3.5" /></span>}
                {v.title && <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-black/60 p-1 text-[10px] leading-tight text-white">{v.title}</span>}
              </button>
            ))}
          </div>
          {loading && <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          {!loading && !error && !videos.length && <p className="py-8 text-center text-sm text-muted-foreground">No public videos were found on this TikTok account.</p>}
          {more && !loading && <div className="flex justify-center py-3"><Button variant="outline" size="sm" onClick={() => load(cursor)}>Load more</Button></div>}
        </div>
        <div className="flex items-center justify-between gap-3 border-t p-3">
          <span className="text-xs text-muted-foreground">{toAdd.length ? `${toAdd.length} to add` : ''}{toAdd.length && toRemove.length ? ', ' : ''}{toRemove.length ? `${toRemove.length} to remove` : ''}{!toAdd.length && !toRemove.length ? 'No changes yet' : ''}</span>
          <Button onClick={save} disabled={saving || (!toAdd.length && !toRemove.length)}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save</Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
