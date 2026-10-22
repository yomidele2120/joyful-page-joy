import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MAX_PRICE_TIERS, getMoq, parseTiers, validatePriceEdit } from '@/lib/pricing';

export interface PriceEditorProduct {
  id: string;
  name: string;
  price: number;
  compare_at_price: number | null;
  moq: number | null;
  unit: string | null;
  price_tiers: Json;
}

/** Lets a supplier change the price of a product they already listed (price, old price, bulk prices). */
export function PriceEditor({ product, onClose, onSaved }: {
  product: PriceEditorProduct;
  onClose: () => void;
  onSaved: () => void;
}) {
  const moq = getMoq(product);
  const unit = (product.unit || 'Piece').trim();
  const [price, setPrice] = useState(String(product.price));
  const [compare, setCompare] = useState(product.compare_at_price ? String(product.compare_at_price) : '');
  const [tiers, setTiers] = useState<{ min_qty: string; price: string }[]>(() => {
    const existing = parseTiers(product.price_tiers).map(t => ({ min_qty: String(t.min_qty), price: String(t.price) }));
    return existing.length ? existing : [{ min_qty: '', price: '' }];
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const result = validatePriceEdit({ price, compare_at_price: compare, tiers }, moq);
    if ('error' in result) { toast.error(result.error); return; }
    setSaving(true);
    const { data, error } = await supabase.from('products')
      .update({
        price: result.value.price,
        compare_at_price: result.value.compare_at_price,
        price_tiers: result.value.price_tiers as unknown as Json,
      })
      .eq('id', product.id)
      .select('id');
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // The database silently skips rows you are not allowed to change, so check that one was updated.
    if (!data?.length) { toast.error('Could not save. You can only change the price of your own products.'); return; }
    toast.success('Price updated');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit price</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="edit-price">Price per {unit.toLowerCase()} (₦)</Label>
            <Input id="edit-price" type="number" min={0} step="any" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
            <p className="mt-1 text-xs text-muted-foreground">Applies from the minimum order of {moq} up to your first bulk price.</p>
          </div>

          <div>
            <Label htmlFor="edit-compare">Old price (₦), optional</Label>
            <Input id="edit-compare" type="number" min={0} step="any" inputMode="decimal" placeholder="Shown crossed out next to the price" value={compare} onChange={e => setCompare(e.target.value)} />
          </div>

          <div>
            <Label>Bulk prices, optional</Label>
            <div className="mt-1 space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input type="number" min={moq + 1} placeholder="From quantity" aria-label="From quantity" value={t.min_qty}
                    onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, min_qty: e.target.value } : x))} />
                  <Input type="number" min={0} step="any" placeholder="Unit price (₦)" aria-label="Unit price" value={t.price}
                    onChange={e => setTiers(prev => prev.map((x, j) => j === i ? { ...x, price: e.target.value } : x))} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove bulk price"
                    onClick={() => setTiers(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ min_qty: '', price: '' }])}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            {tiers.length < MAX_PRICE_TIERS && (
              <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => setTiers(prev => [...prev, { min_qty: '', price: '' }])}>
                <Plus className="mr-1 h-4 w-4" /> Add bulk price
              </Button>
            )}
          </div>

          <p className="rounded-md bg-secondary p-3 text-xs text-muted-foreground">
            The new price applies to new orders straight away. Orders already placed keep the price the buyer paid.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save price</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
