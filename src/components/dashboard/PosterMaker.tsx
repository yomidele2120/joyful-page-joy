import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { POSTER_ACCENTS, POSTER_DESIGNS, POSTER_SIZE, nextDesignIndex } from '@/lib/ads/posterDesigns';
import type { CreativeFile } from '@/components/dashboard/AdCreativeUploader';

const CTAS = ['Visit shop', 'Shop now', 'Learn more', 'Order today'];

/**
 * Turns one photo into a designed ad picture, right in the browser (free, nothing is sent to an AI service).
 * The vendor picks a photo, types a short headline and presses Shuffle to see the same message in a different layout.
 * "Add to my request" saves the finished picture with the vendor's other files.
 */
export default function PosterMaker({ vendorId, files, maxFiles, onAdd }: { vendorId: string; files: CreativeFile[]; maxFiles: number; onAdd: (f: CreativeFile) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [design, setDesign] = useState(() => Math.floor(Math.random() * POSTER_DESIGNS.length));
  const [accent, setAccent] = useState(() => POSTER_ACCENTS[Math.floor(Math.random() * POSTER_ACCENTS.length)]);
  const [shop, setShop] = useState('');
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState(CTAS[0]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const photos = files.filter((f) => f.kind === 'photo');

  useEffect(() => {
    const c = canvas.current; if (!open || !c) return;
    c.width = POSTER_SIZE; c.height = POSTER_SIZE;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, POSTER_SIZE, POSTER_SIZE);
    POSTER_DESIGNS[design].draw(ctx, POSTER_SIZE, POSTER_SIZE, { image: img, shop: shop.trim() || 'Your shop', headline: headline.trim() || 'Your headline here', cta, accent }, img);
  }, [open, design, accent, shop, headline, cta, img]);

  const load = (url: string, cors: boolean) => new Promise<void>((resolve) => {
    const i = new Image(); if (cors) i.crossOrigin = 'anonymous';
    i.onload = () => { setImg(i); resolve(); };
    i.onerror = () => { toast.error('That photo could not be opened. Choose another.'); resolve(); };
    i.src = url;
  });
  const fromDevice = (list: FileList | null) => {
    const f = list?.[0]; if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) { toast.error('Use a JPG, PNG or WebP photo.'); return; }
    void load(URL.createObjectURL(f), false);
  };
  const fromAttached = async (path: string) => {
    const { data } = await supabase.storage.from('ad-creatives').createSignedUrl(path, 300);
    if (!data?.signedUrl) { toast.error('Could not open that photo.'); return; }
    await load(data.signedUrl, true);
  };

  const save = async () => {
    const c = canvas.current; if (!c || busy) return;
    if (!img) { toast.error('Choose a photo first.'); return; }
    if (headline.trim().length < 3) { toast.error('Type a headline of at least 3 characters.'); return; }
    setBusy(true);
    try {
      const blob: Blob | null = await new Promise((r) => { try { c.toBlob(r, 'image/jpeg', 0.92); } catch { r(null); } });
      if (!blob) { toast.error('The photo came from a place that does not allow editing. Upload it from your device instead.'); return; }
      const path = `${vendorId}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from('ad-creatives').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (error) { toast.error(`Could not save the picture. ${error.message}`); return; }
      onAdd({ kind: 'photo', path, name: `Poster - ${POSTER_DESIGNS[design].label}`, size: blob.size });
      toast.success('Poster added to your request.');
    } finally { setBusy(false); }
  };

  if (!open) return <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setOpen(true)}>Design a poster from a photo (free)</Button>;
  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <p className="text-sm font-medium">Design a poster from a photo</p>
      <p className="mt-1 text-xs text-muted-foreground">Pick a photo, write a short headline and press Shuffle to try a different layout. It is made in your browser and is free. Do not put prices or claims you cannot prove in the headline; our team checks every request.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,320px)_1fr]">
        <canvas ref={canvas} role="img" aria-label="Poster preview" className="aspect-square w-full rounded-lg border border-border bg-muted" />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Choose a photo from your device" onChange={(e) => { fromDevice(e.target.files); e.target.value = ''; }} />
            <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>Photo from my device</Button>
            {photos.length > 0 && (
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" defaultValue="" aria-label="Use a photo already attached"
                onChange={(e) => { if (e.target.value) void fromAttached(e.target.value); }}>
                <option value="">Or use an attached photo…</option>
                {photos.map((p) => <option key={p.path} value={p.path}>{p.name}</option>)}
              </select>)}
          </div>
          <Input value={shop} maxLength={40} onChange={(e) => setShop(e.target.value)} placeholder="Shop name" aria-label="Shop name" />
          <Input value={headline} maxLength={60} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline, for example: New laptops just landed" aria-label="Headline" />
          <select className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={cta} onChange={(e) => setCta(e.target.value)} aria-label="Button wording">{CTAS.map((c) => <option key={c}>{c}</option>)}</select>
          <div className="flex items-center gap-2" role="group" aria-label="Colour">
            {POSTER_ACCENTS.map((a) => <button key={a} type="button" aria-label={`Colour ${a}`} aria-pressed={a === accent} onClick={() => setAccent(a)}
              className={`h-7 w-7 rounded-full border-2 ${a === accent ? 'border-foreground' : 'border-transparent'}`} style={{ background: a }} />)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setDesign((d) => nextDesignIndex(d))}>Shuffle layout ({POSTER_DESIGNS[design].label})</Button>
            <Button type="button" size="sm" disabled={busy || files.length >= maxFiles} onClick={save}>{busy ? 'Saving…' : 'Add to my request'}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
          </div>
          {files.length >= maxFiles && <p className="text-xs text-destructive">You already have {maxFiles} files. Remove one to add the poster.</p>}
        </div>
      </div>
    </div>
  );
}
