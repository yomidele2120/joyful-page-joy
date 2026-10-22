import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useMarketplaceSettings } from '@/hooks/useMarketplace';

export interface PreorderForm {
  enabled: boolean;
  release: string;
  delivery: string;
  limit: string;
  maxPer: string;
  terms: string;
  status: 'open' | 'ready' | 'closed';
}

export const emptyPreorder: PreorderForm = { enabled: false, release: '', delivery: '', limit: '', maxPer: '', terms: '', status: 'open' };

export function preorderFromProduct(p: {
  is_preorder?: boolean; preorder_release_date?: string | null; preorder_delivery_estimate?: string | null;
  preorder_quantity_limit?: number | null; preorder_max_per_order?: number | null; preorder_terms?: string | null; preorder_status?: string;
}): PreorderForm {
  return {
    enabled: !!p.is_preorder,
    release: p.preorder_release_date ?? '',
    delivery: p.preorder_delivery_estimate ?? '',
    limit: p.preorder_quantity_limit != null ? String(p.preorder_quantity_limit) : '',
    maxPer: p.preorder_max_per_order != null ? String(p.preorder_max_per_order) : '',
    terms: p.preorder_terms ?? '',
    status: (['open', 'ready', 'closed'].includes(p.preorder_status ?? '') ? p.preorder_status : 'open') as PreorderForm['status'],
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const toInt = (v: string) => (v.trim() ? Math.floor(Number(v)) : null);

// Checks the form and builds the database fields. The database enforces the same rules again.
export function buildPreorderPayload(form: PreorderForm, isNew: boolean): { error: string } | { data: Record<string, unknown> } {
  if (!form.enabled) {
    return { data: { is_preorder: false, preorder_release_date: null, preorder_delivery_estimate: null, preorder_quantity_limit: null, preorder_max_per_order: null, preorder_terms: null, preorder_status: 'open' } };
  }
  if (!form.release) return { error: 'Choose the expected availability date for the preorder.' };
  if (isNew && form.release < today()) return { error: 'The expected availability date cannot be in the past.' };
  if (form.delivery && form.delivery < form.release) return { error: 'The delivery estimate cannot be before the availability date.' };
  const limit = toInt(form.limit);
  const maxPer = toInt(form.maxPer);
  if (limit !== null && !(limit >= 1)) return { error: 'The quantity available for preorder must be at least 1.' };
  if (maxPer !== null && !(maxPer >= 1)) return { error: 'The limit per order must be at least 1.' };
  if (limit !== null && maxPer !== null && maxPer > limit) return { error: 'The limit per order cannot be more than the quantity available.' };
  if (form.terms.length > 2000) return { error: 'Preorder terms are too long (2000 characters at most).' };
  return {
    data: {
      is_preorder: true,
      bnpl_eligible: false, // Pay later is never offered on preorders
      preorder_release_date: form.release,
      preorder_delivery_estimate: form.delivery || null,
      preorder_quantity_limit: limit,
      preorder_max_per_order: maxPer,
      preorder_terms: form.terms.trim() || null,
      preorder_status: form.status,
    },
  };
}

export function PreorderFields({ value, onChange, showStatus = false }: { value: PreorderForm; onChange: (v: PreorderForm) => void; showStatus?: boolean }) {
  const { data: settings } = useMarketplaceSettings();
  const set = <K extends keyof PreorderForm>(key: K, v: PreorderForm[K]) => onChange({ ...value, [key]: v });
  const disabled = settings?.preorder_enabled === false;

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div className="flex items-start gap-3">
        <Switch id="is-preorder" checked={value.enabled} disabled={disabled} onCheckedChange={v => set('enabled', v)} />
        <div>
          <Label htmlFor="is-preorder" className="font-medium">Offer as a preorder</Label>
          <p className="text-xs text-muted-foreground">
            Buyers pay the full price now and you deliver when the product is available. Preorder listings are reviewed by an admin before buyers see them,
            and Pay later cannot be used on them. {disabled && 'Preorders are switched off on the marketplace right now.'}
          </p>
        </div>
      </div>

      {value.enabled && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="po-release">Expected availability date *</Label>
            <Input id="po-release" type="date" value={value.release} onChange={e => set('release', e.target.value)} required />
            <p className="mt-1 text-xs text-muted-foreground">Be honest: buyers can cancel if this slips.</p>
          </div>
          <div>
            <Label htmlFor="po-delivery">Estimated delivery date (optional)</Label>
            <Input id="po-delivery" type="date" value={value.delivery} min={value.release || undefined} onChange={e => set('delivery', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="po-limit">Places available (optional)</Label>
            <Input id="po-limit" type="number" min={1} value={value.limit} onChange={e => set('limit', e.target.value)} placeholder="Leave empty for no limit" />
            <p className="mt-1 text-xs text-muted-foreground">Only take as many preorders as you can fulfil.</p>
          </div>
          <div>
            <Label htmlFor="po-max">Limit per order (optional)</Label>
            <Input id="po-max" type="number" min={1} value={value.maxPer} onChange={e => set('maxPer', e.target.value)} />
          </div>
          {showStatus && (
            <div>
              <Label>Preorder status</Label>
              <Select value={value.status} onValueChange={v => set('status', v as PreorderForm['status'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open: taking preorders</SelectItem>
                  <SelectItem value="ready">Ready: stock arrived, preparing delivery</SelectItem>
                  <SelectItem value="closed">Closed: no more preorders</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Buyers are notified when you mark it ready or change a date.</p>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label htmlFor="po-terms">Your preorder terms (optional)</Label>
            <Textarea id="po-terms" rows={3} maxLength={2000} value={value.terms} onChange={e => set('terms', e.target.value)} placeholder="Anything buyers should know, e.g. how you will update them." />
          </div>
        </div>
      )}
    </div>
  );
}

// Edit the preorder settings of an existing product.
export function PreorderEditor({ product, onClose, onSaved }: {
  product: { id: string; name: string; is_preorder?: boolean; preorder_approved?: boolean } & Parameters<typeof preorderFromProduct>[0];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PreorderForm>(preorderFromProduct(product));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const result = buildPreorderPayload(form, !product.is_preorder);
    if ('error' in result) { toast.error(result.error); return; }
    setSaving(true);
    const { error } = await supabase.from('products')
      .update(result.data as Database['public']['Tables']['products']['Update']).eq('id', product.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Preorder settings saved');
    onSaved();
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preorder settings</DialogTitle>
          <DialogDescription>{product.name}{product.is_preorder && !product.preorder_approved ? ' - waiting for admin approval' : ''}</DialogDescription>
        </DialogHeader>
        <PreorderFields value={form} onChange={setForm} showStatus={!!product.is_preorder} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
