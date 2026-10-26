import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImagePlus, Loader2, Plus, Star, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { compressImage } from '@/lib/mediaProcessing';
import { makeThumbnail } from '@/lib/images';
import { MAX_PRICE_TIERS, parseSpecs, parseTiers, validatePriceEdit } from '@/lib/pricing';
import { useCategories } from '@/hooks/useProducts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const MAX_PHOTOS = 9; // 1 main photo + 8 more, the same limit as "Add product"

/** One photo in the editor: an existing link, or a new file that is uploaded when you save. */
interface Photo { key: string; url: string; file?: File }

const FIELDS =
  'id, vendor_id, name, brand, category_id, description, stock_quantity, badge, unit, moq, video_url, specs, ' +
  'price, compare_at_price, price_tiers, image_url, thumb_url, images, is_active';

/**
 * Lets a supplier change everything about a product they already listed: photos (add, delete, choose the main one),
 * name, brand, category, description, stock, minimum order, specifications, video, prices and visibility.
 */
export function ProductEditor({ productId, onClose, onSaved }: { productId: string; onClose: () => void; onSaved: () => void }) {
  const { data: full, isLoading, error } = useQuery({
    queryKey: ['vendor-product-edit', productId],
    staleTime: 0,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('products').select(FIELDS).eq('id', productId).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>{full?.name ?? 'Loading…'}</DialogDescription>
        </DialogHeader>
        {isLoading && <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
        {!isLoading && (error || !full) && (
          <p className="py-8 text-center text-sm text-muted-foreground">Could not open this product. Close this window and try again.</p>
        )}
        {full && <EditorForm product={full} onClose={onClose} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function EditorForm({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: () => void }) {
  const { data: categories } = useCategories();
  const fileInput = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const [photos, setPhotos] = useState<Photo[]>(() => {
    const urls = [...new Set([product.image_url, ...(product.images || [])].filter((u: unknown): u is string => !!u))];
    return urls.map((url, i) => ({ key: `old-${i}`, url }));
  });
  const [form, setForm] = useState({
    name: product.name ?? '',
    brand: product.brand ?? '',
    category_id: product.category_id ?? '',
    description: product.description ?? '',
    stock_quantity: String(product.stock_quantity ?? 0),
    badge: product.badge ?? '',
    unit: product.unit ?? 'Piece',
    moq: String(product.moq ?? 1),
    video_url: product.video_url ?? '',
    price: String(product.price ?? ''),
    compare: product.compare_at_price ? String(product.compare_at_price) : '',
    is_active: product.is_active !== false,
  });
  const [tiers, setTiers] = useState<{ min_qty: string; price: string }[]>(() => {
    const t = parseTiers(product.price_tiers as Json).map(x => ({ min_qty: String(x.min_qty), price: String(x.price) }));
    return t.length ? t : [{ min_qty: '', price: '' }];
  });
  const [specs, setSpecs] = useState<{ key: string; value: string }[]>(() => {
    const s = parseSpecs(product.specs as Json).map(([key, value]) => ({ key, value }));
    return s.length ? s : [{ key: '', value: '' }];
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  // Free the temporary previews of new photos when the window closes.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach(p => { if (p.file) URL.revokeObjectURL(p.url); }), []);

  const addFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/'));
    if (fileInput.current) fileInput.current.value = '';
    if (!files.length) return;
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) toast.error(room > 0 ? `A product can have ${MAX_PHOTOS} photos. Only the first ${room} were added.` : `A product can have ${MAX_PHOTOS} photos. Delete one first.`);
    const stamp = Date.now();
    setPhotos(prev => [...prev, ...files.slice(0, Math.max(0, room)).map((file, i) => ({ key: `new-${stamp}-${i}`, url: URL.createObjectURL(file), file }))]);
  };
  const removePhoto = (key: string) => setPhotos(prev => {
    const gone = prev.find(p => p.key === key);
    if (gone?.file) URL.revokeObjectURL(gone.url);
    return prev.filter(p => p.key !== key);
  });
  const makeMain = (key: string) => setPhotos(prev => { const p = prev.find(x => x.key === key); return p ? [p, ...prev.filter(x => x.key !== key)] : prev; });

  const save = async () => {
    const name = form.name.trim();
    if (!name) { toast.error('Enter a product name'); return; }
    const stock = Number(form.stock_quantity);
    if (!Number.isInteger(stock) || stock < 0) { toast.error('Stock must be a whole number, 0 or more'); return; }
    const moq = Math.max(1, Math.floor(Number(form.moq)) || 1);
    const video = form.video_url.trim();
    if (video && !/^https?:\/\//i.test(video)) { toast.error('The video link must start with https://'); return; }
    const priced = validatePriceEdit({ price: form.price, compare_at_price: form.compare, tiers }, moq);
    if ('error' in priced) { toast.error(priced.error); return; }
    const specsObject: Record<string, string> = {};
    specs.forEach(s => { if (s.key.trim() && s.value.trim()) specsObject[s.key.trim()] = s.value.trim(); });

    setSaving(true);
    try {
      // 1. Upload the new photos (shrunk to 1200 px first, like when adding a product).
      const stamp = Date.now();
      const upload = async (blob: Blob, ext: string, label: string) => {
        const path = `${product.vendor_id}/products/${stamp}-${label}.${ext}`;
        const { error } = await supabase.storage.from('vendor-assets').upload(path, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' });
        if (error) throw new Error(error.message);
        return supabase.storage.from('vendor-assets').getPublicUrl(path).data.publicUrl;
      };
      const urls = await Promise.all(photos.map(async (p, i) => {
        if (!p.file) return p.url;
        const blob = await compressImage(p.file, 1200, 0.82);
        const ext = blob.type === 'image/jpeg' ? 'jpg' : (p.file.name.split('.').pop() || 'jpg').toLowerCase();
        return upload(blob, ext, String(i));
      }));

      // 2. The first photo is the main one. Cards show a small copy of it: make one for a new main photo,
      //    clear it when another existing photo became the main one (cards then use the full photo until
      //    scripts/backfill-thumbnails.mjs makes the small copy), and leave it alone when the main photo is unchanged.
      const newMain = urls[0] ?? null;
      const update: Record<string, unknown> = {
        name, brand: form.brand.trim() || null, category_id: form.category_id || null,
        description: form.description.trim() || null, stock_quantity: stock, badge: form.badge.trim() || null,
        unit: form.unit.trim() || 'Piece', moq, video_url: video || null, specs: specsObject,
        price: priced.value.price, compare_at_price: priced.value.compare_at_price,
        price_tiers: priced.value.price_tiers as unknown as Json,
        image_url: newMain, images: urls.slice(1), is_active: form.is_active,
      };
      if (newMain !== (product.image_url ?? null)) {
        const mainFile = photos[0]?.file;
        const thumb = mainFile ? await makeThumbnail(mainFile).catch(() => null) : null;
        update.thumb_url = thumb ? await upload(thumb, 'jpg', 'thumb').catch(() => null) : null;
      }

      // 3. Save. The database silently skips rows you may not change, so check that one was updated.
      const { data, error } = await (supabase as any).from('products').update(update).eq('id', product.id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Could not save. You can only edit your own products.');
      toast.success('Product updated');
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save. Nothing was changed, please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        {/* Photos */}
        <div>
          <div className="flex items-center justify-between">
            <Label>Photos ({photos.length}/{MAX_PHOTOS})</Label>
            <Button type="button" variant="outline" size="sm" disabled={photos.length >= MAX_PHOTOS} onClick={() => fileInput.current?.click()}>
              <ImagePlus className="mr-1.5 h-4 w-4" /> Add photos
            </Button>
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
          </div>
          {photos.length ? (
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <div key={p.key} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary">
                  <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground">Main photo</span>}
                  {p.file && <span className="absolute bottom-1 left-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px]">New</span>}
                  <button type="button" aria-label={`Delete photo ${i + 1}`} onClick={() => removePhoto(p.key)}
                    className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-destructive shadow hover:bg-background">
                    <X className="h-3.5 w-3.5" />
                  </button>
                  {i > 0 && (
                    <button type="button" aria-label={`Make photo ${i + 1} the main photo`} onClick={() => makeMain(p.key)}
                      className="absolute bottom-1 right-1 flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-[11px] font-medium shadow hover:bg-background">
                      <Star className="h-3 w-3" /> Make main
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <button type="button" onClick={() => fileInput.current?.click()}
              className="mt-2 flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-secondary">
              <ImagePlus className="h-6 w-6" />
              This product has no photos. Buyers see a blank picture until you add one.
            </button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">The first photo is the one shown on product cards. Photos are shrunk automatically. Changes apply when you press Save changes.</p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Label htmlFor="pe-name">Name *</Label><Input id="pe-name" value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div><Label htmlFor="pe-brand">Brand</Label><Input id="pe-brand" value={form.brand} onChange={e => set('brand', e.target.value)} /></div>
          <div>
            <Label>Category</Label>
            <Select value={form.category_id || undefined} onValueChange={v => set('category_id', v)}>
              <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
              <SelectContent>{(categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="pe-badge">Badge</Label><Input id="pe-badge" placeholder="New, Sale" value={form.badge} onChange={e => set('badge', e.target.value)} /></div>
          <div><Label htmlFor="pe-stock">Stock</Label><Input id="pe-stock" type="number" min={0} value={form.stock_quantity} onChange={e => set('stock_quantity', e.target.value)} /></div>
          <div><Label htmlFor="pe-unit">Unit</Label><Input id="pe-unit" placeholder="Piece, Carton, Kg…" value={form.unit} onChange={e => set('unit', e.target.value)} /></div>
          <div><Label htmlFor="pe-moq">Minimum order (MOQ)</Label><Input id="pe-moq" type="number" min={1} value={form.moq} onChange={e => set('moq', e.target.value)} /></div>
          <div><Label htmlFor="pe-video">Product video link</Label><Input id="pe-video" placeholder="https://…" value={form.video_url} onChange={e => set('video_url', e.target.value)} /></div>
        </div>
        <div><Label htmlFor="pe-desc">Description</Label><Textarea id="pe-desc" rows={5} value={form.description} onChange={e => set('description', e.target.value)} /></div>

        {/* Prices */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div><Label htmlFor="pe-price">Price (₦) *</Label><Input id="pe-price" type="number" min={0} step="any" inputMode="decimal" value={form.price} onChange={e => set('price', e.target.value)} /></div>
          <div><Label htmlFor="pe-compare">Old price (₦), optional</Label><Input id="pe-compare" type="number" min={0} step="any" inputMode="decimal" placeholder="Shown crossed out" value={form.compare} onChange={e => set('compare', e.target.value)} /></div>
        </div>
        <div>
          <Label>Bulk prices, optional</Label>
          <div className="mt-1 space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input type="number" min={2} placeholder="From quantity" aria-label="From quantity" value={t.min_qty} onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, min_qty: e.target.value } : x))} />
                <Input type="number" min={0} step="any" placeholder="Unit price (₦)" aria-label="Unit price" value={t.price} onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove bulk price" onClick={() => setTiers(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ min_qty: '', price: '' }])}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          {tiers.length < MAX_PRICE_TIERS && (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setTiers(prev => [...prev, { min_qty: '', price: '' }])}><Plus className="mr-1 h-4 w-4" /> Add bulk price</Button>
          )}
        </div>

        {/* Specifications */}
        <div>
          <Label>Specifications, optional</Label>
          <div className="mt-1 space-y-2">
            {specs.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="e.g. Material" aria-label="Specification name" value={s.key} onChange={e => setSpecs(prev => prev.map((x, j) => j === i ? { ...x, key: e.target.value } : x))} />
                <Input placeholder="e.g. Stainless steel" aria-label="Specification value" value={s.value} onChange={e => setSpecs(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove specification" onClick={() => setSpecs(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ key: '', value: '' }])}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          {specs.length < 10 && (
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setSpecs(prev => [...prev, { key: '', value: '' }])}><Plus className="mr-1 h-4 w-4" /> Add specification</Button>
          )}
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-border p-4">
          <Switch id="pe-active" checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
          <div>
            <Label htmlFor="pe-active" className="font-medium">Show in my shop</Label>
            <p className="text-xs text-muted-foreground">Turn off to hide this product from buyers without deleting it.</p>
          </div>
        </div>

        <p className="rounded-md bg-secondary p-3 text-xs text-muted-foreground">
          New prices apply to new orders straight away. Orders already placed keep the price the buyer paid. Pay later and preorder are changed from the product list.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save changes</Button>
      </DialogFooter>
    </>
  );
}

export default ProductEditor;
