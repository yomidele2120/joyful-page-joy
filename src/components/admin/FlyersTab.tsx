import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { compressImage } from '@/lib/mediaProcessing';
import type { Tables } from '@/integrations/supabase/types';
import { PLACEMENTS, placementInfo, type FlyerPlacement } from '@/lib/flyerPlacements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Flyer = Tables<'flyers'>;

const BUCKET = 'flyers';
const MAX_MB = 5;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// Spots where the site only has room for a few flyers.
const SHOWN_LIMIT: Partial<Record<FlyerPlacement, number>> = { hero_side: 2, row_banner: 3 };

// ---- helpers --------------------------------------------------------------

function isValidLink(v: string) {
  return !v || (v.startsWith('/') && !v.startsWith('//')) || v.startsWith('https://');
}

function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function status(f: Flyer, now = Date.now()): { label: string; tone: 'default' | 'secondary' | 'outline' | 'destructive' } {
  if (!f.is_active) return { label: 'Off', tone: 'secondary' };
  if (f.starts_at && new Date(f.starts_at).getTime() > now) return { label: 'Scheduled', tone: 'outline' };
  if (f.ends_at && new Date(f.ends_at).getTime() <= now) return { label: 'Ended', tone: 'destructive' };
  return { label: 'Live', tone: 'default' };
}

function pathFromUrl(url: string | null) {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

async function uploadImage(file: File): Promise<string> {
  // Shrink big images (PNG/JPG/WebP) so banners load fast; GIFs are left as they are.
  const blob = await compressImage(file, 1920, 0.85);
  const ext = blob.type === 'image/jpeg' ? 'jpg' : (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || file.type, cacheControl: '31536000' });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeImages(urls: (string | null)[]) {
  const paths = urls.map(pathFromUrl).filter((p): p is string => !!p);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths).catch(() => undefined);
}

// ---- tab ------------------------------------------------------------------

export default function FlyersTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Flyer | 'new' | null>(null);
  const [newIn, setNewIn] = useState<FlyerPlacement>('hero_slide');
  const openNew = (placement: FlyerPlacement) => { setNewIn(placement); setEditing('new'); };
  const [deleting, setDeleting] = useState<Flyer | null>(null);

  const { data: flyers, isLoading, error } = useQuery({
    queryKey: ['admin-flyers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flyers').select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-flyers'] });
    queryClient.invalidateQueries({ queryKey: ['flyers'] });
  };

  const byPlacement = useMemo(() => {
    const map = new Map<string, Flyer[]>();
    (flyers ?? []).forEach(f => map.set(f.placement, [...(map.get(f.placement) ?? []), f]));
    return map;
  }, [flyers]);

  const toggleActive = async (f: Flyer, value: boolean) => {
    const { error } = await supabase.from('flyers').update({ is_active: value }).eq('id', f.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const move = async (list: Flyer[], index: number, dir: -1 | 1) => {
    if (!list[index + dir]) return;
    const reordered = [...list];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(index + dir, 0, moved);
    // Positions are rewritten 0..n so they stay unique even if old ones tied.
    const updates = reordered
      .map((f, i) => (f.sort_order === i ? null : supabase.from('flyers').update({ sort_order: i }).eq('id', f.id)))
      .filter(Boolean);
    const results = await Promise.all(updates as PromiseLike<{ error: { message: string } | null }>[]);
    const err = results.find(r => r.error)?.error;
    if (err) return toast.error(err.message);
    refresh();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const f = deleting;
    const { error } = await supabase.from('flyers').delete().eq('id', f.id);
    if (error) return toast.error(error.message);
    await removeImages([f.image_url, f.mobile_image_url]);
    toast.success('Flyer deleted');
    setDeleting(null);
    refresh();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Flyers</h2>
          <p className="text-sm text-muted-foreground">
            Upload promo images for the homepage and listings. Where a spot has no uploaded flyer, the site shows its built-in one.
          </p>
        </div>
        <Button size="sm" onClick={() => openNew('hero_slide')}><Plus className="mr-1 h-4 w-4" /> Add flyer</Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Flyers could not be loaded: {(error as Error).message}. If this is a new setup, apply the latest database migration (<code>20261014120000_flyers.sql</code>).
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <div className="space-y-6">
          {PLACEMENTS.map(p => {
            const list = byPlacement.get(p.value) ?? [];
            const limit = SHOWN_LIMIT[p.value];
            let liveSeen = 0;
            return (
              <section key={p.value} className="rounded-lg border border-border bg-card">
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="font-heading text-base font-semibold">{p.label}</h3>
                    <p className="text-xs text-muted-foreground">{p.where}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Image size {p.desktop}{p.mobile !== 'Not needed' ? `, phone ${p.mobile} (optional)` : ''}. {p.limit}.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openNew(p.value)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
                </div>

                {list.length === 0 ? (
                  <p className="px-4 py-5 text-sm text-muted-foreground">Nothing uploaded. The site shows its built-in flyer here.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {list.map((f, i) => {
                      const st = status(f);
                      const live = st.label === 'Live';
                      const beyondLimit = live && limit !== undefined && liveSeen++ >= limit;
                      return (
                        <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
                          <img src={f.image_url} alt="" className="h-16 w-28 shrink-0 rounded-md border border-border bg-secondary object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{f.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{f.link_url || 'No link'}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <Badge variant={st.tone} className="px-1.5 py-0 text-[10px]">{st.label}</Badge>
                              {beyondLimit && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Not shown: only {limit} fit</Badge>}
                              {f.mobile_image_url && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Phone image</Badge>}
                              {f.ends_at && <Badge variant="outline" className="px-1.5 py-0 text-[10px]">Ends {new Date(f.ends_at).toLocaleDateString()}</Badge>}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Switch checked={f.is_active} onCheckedChange={v => toggleActive(f, v)} aria-label={`Show ${f.title}`} />
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(list, i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={i === list.length - 1} onClick={() => move(list, i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(f)} aria-label="Edit"><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDeleting(f)} aria-label="Delete"><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editing && (
        <FlyerFormDialog
          flyer={editing === 'new' ? null : editing}
          defaultPlacement={newIn}
          existing={flyers ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={o => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this flyer?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.title}” and its images will be removed from the website. To hide it for now instead, turn its switch off.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep flyer</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete flyer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---- add / edit form ------------------------------------------------------

function FlyerFormDialog({
  flyer, defaultPlacement, existing, onClose, onSaved,
}: { flyer: Flyer | null; defaultPlacement: FlyerPlacement; existing: Flyer[]; onClose: () => void; onSaved: () => void }) {
  const [placement, setPlacement] = useState<FlyerPlacement>((flyer?.placement as FlyerPlacement) ?? defaultPlacement);
  const [title, setTitle] = useState(flyer?.title ?? '');
  const [link, setLink] = useState(flyer?.link_url ?? '');
  const [active, setActive] = useState(flyer?.is_active ?? true);
  const [startsAt, setStartsAt] = useState(toLocalInput(flyer?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(flyer?.ends_at ?? null));
  const [desktopFile, setDesktopFile] = useState<File | null>(null);
  const [mobileFile, setMobileFile] = useState<File | null>(null);
  const [removeMobile, setRemoveMobile] = useState(false);
  const [saving, setSaving] = useState(false);

  const info = placementInfo(placement)!;
  const needsPhoneImage = placement !== 'feed_card';
  const desktopPreview = useMemo(() => (desktopFile ? URL.createObjectURL(desktopFile) : flyer?.image_url ?? null), [desktopFile, flyer]);
  const mobilePreview = useMemo(
    () => (mobileFile ? URL.createObjectURL(mobileFile) : removeMobile ? null : flyer?.mobile_image_url ?? null),
    [mobileFile, removeMobile, flyer],
  );

  const pickFile = (file: File | undefined, set: (f: File | null) => void) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) return toast.error('Use a PNG, JPG, WebP or GIF image');
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`Image must be under ${MAX_MB} MB`);
    set(file);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return toast.error('Give the flyer a title');
    if (!flyer && !desktopFile) return toast.error('Choose the flyer image');
    if (!isValidLink(link.trim())) return toast.error('Link must start with / (a page on this site) or https://');
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) return toast.error('The end date must be after the start date');

    setSaving(true);
    const uploaded: string[] = [];
    try {
      let imageUrl = flyer?.image_url ?? '';
      let mobileUrl: string | null = removeMobile ? null : flyer?.mobile_image_url ?? null;

      if (desktopFile) { imageUrl = await uploadImage(desktopFile); uploaded.push(imageUrl); }
      if (mobileFile && needsPhoneImage) { mobileUrl = await uploadImage(mobileFile); uploaded.push(mobileUrl); }
      if (!needsPhoneImage) mobileUrl = null;

      const nextOrder = existing.filter(f => f.placement === placement).reduce((m, f) => Math.max(m, f.sort_order), -1) + 1;
      const row = {
        title: title.trim(),
        placement,
        image_url: imageUrl,
        mobile_image_url: mobileUrl,
        link_url: link.trim() || null,
        is_active: active,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      };

      if (flyer) {
        // Moving to another spot puts it at the end of that spot's list.
        const { error } = await supabase.from('flyers').update({ ...row, ...(placement !== flyer.placement ? { sort_order: nextOrder } : {}) }).eq('id', flyer.id);
        if (error) throw error;
        // Clean up images that were replaced.
        await removeImages([
          desktopFile ? flyer.image_url : null,
          mobileFile || removeMobile || !needsPhoneImage ? flyer.mobile_image_url : null,
        ]);
      } else {
        const { error } = await supabase.from('flyers').insert({ ...row, sort_order: nextOrder });
        if (error) throw error;
      }

      toast.success(flyer ? 'Flyer updated' : 'Flyer added');
      onSaved();
    } catch (err) {
      await removeImages(uploaded);
      toast.error((err as { message?: string })?.message || 'Could not save the flyer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{flyer ? 'Edit flyer' : 'Add flyer'}</DialogTitle>
          <DialogDescription>{info.where}.</DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div>
            <Label>Where should it appear?</Label>
            <Select value={placement} onValueChange={v => setPlacement(v as FlyerPlacement)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLACEMENTS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">{info.limit}.</p>
          </div>

          <div>
            <Label htmlFor="flyer-title">Title</Label>
            <Input id="flyer-title" className="mt-1" value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="Eid sale on electronics" />
            <p className="mt-1 text-xs text-muted-foreground">Read aloud by screen readers and shown to you in this list. Describe what the image says.</p>
          </div>

          <ImagePicker
            label={`Flyer image (${info.desktop})`}
            preview={desktopPreview}
            onFile={f => pickFile(f, setDesktopFile)}
            required={!flyer}
          />

          {needsPhoneImage && (
            <ImagePicker
              label={`Phone image, optional (${info.mobile})`}
              hint="Shown instead of the main image on phones. Without it, phones use the main image."
              preview={mobilePreview}
              onFile={f => { setRemoveMobile(false); pickFile(f, setMobileFile); }}
              onClear={mobilePreview ? () => { setMobileFile(null); setRemoveMobile(true); } : undefined}
            />
          )}

          <div>
            <Label htmlFor="flyer-link">Link (optional)</Label>
            <Input id="flyer-link" className="mt-1" value={link} onChange={e => setLink(e.target.value)} placeholder="/products or https://example.com/offer" />
            <p className="mt-1 text-xs text-muted-foreground">Where shoppers go when they tap the flyer. Use /products style paths for pages on this site.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="flyer-start">Show from (optional)</Label>
              <Input id="flyer-start" type="datetime-local" className="mt-1" value={startsAt} onChange={e => setStartsAt(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="flyer-end">Hide after (optional)</Label>
              <Input id="flyer-end" type="datetime-local" className="mt-1" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <Label htmlFor="flyer-active" className="cursor-pointer">Show on the website</Label>
            <Switch id="flyer-active" checked={active} onCheckedChange={setActive} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : flyer ? 'Save changes' : 'Add flyer'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImagePicker({
  label, hint, preview, onFile, onClear, required,
}: { label: string; hint?: string; preview: string | null; onFile: (f: File | undefined) => void; onClear?: () => void; required?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-secondary">
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
        </div>
        <div className="flex flex-col items-start gap-1.5">
          <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-secondary focus-within:ring-2 focus-within:ring-ring">
            {preview ? 'Replace image' : 'Choose image'}
            <input type="file" accept={ALLOWED.join(',')} className="sr-only" required={required && !preview} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {onClear && <button type="button" onClick={onClear} className="text-xs text-destructive hover:underline">Remove image</button>}
          <p className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to {MAX_MB} MB.</p>
        </div>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
