import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Loader2, Package, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cleanLike } from '@/lib/productSearch';
import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Brief { id: string; name: string; price: number | null; image_url: string | null }

const COLUMNS = 'id, name, price, image_url';
const SHOWN = 12;

// Search-as-you-type picker for the product a post links to. It searches this supplier's own shop in the database
// (so it stays fast with thousands of products) and only offers products shoppers can actually open. It is built as an
// inline panel, not a pop-up, so it works inside the "Create a post" sheet on a phone.
export default function ProductLinkPicker({ vendorId, value, onChange }: {
  vendorId: string; value: string; onChange: (productId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [picked, setPicked] = useState<Brief | null>(null);
  const term = useDebouncedValue(cleanLike(input), 300);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search results (newest first when nothing is typed, so recent products are one tap away).
  const results = useQuery({
    queryKey: ['link-product-search', vendorId, term],
    enabled: open && !!vendorId,
    staleTime: 20_000,
    queryFn: async () => {
      let q = supabase.from('products').select(COLUMNS, { count: 'exact' }).eq('vendor_id', vendorId).eq('is_public', true);
      if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%`);
      const { data, error, count } = await q.order('created_at', { ascending: false }).limit(SHOWN);
      if (error) throw error;
      return { items: (data ?? []) as Brief[], total: count ?? data?.length ?? 0 };
    },
  });

  // A saved draft only remembers the product's id: fetch its name and picture to show it.
  const needsBrief = !!value && picked?.id !== value;
  const brief = useQuery({
    queryKey: ['link-product-brief', value],
    enabled: needsBrief,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select(COLUMNS).eq('id', value).maybeSingle();
      if (error) throw error;
      return (data as Brief | null) ?? null;
    },
  });
  const selected: Brief | null = picked?.id === value ? picked : brief.data ?? null;

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => { if (!value) setPicked(null); }, [value]);

  const choose = (p: Brief) => { setPicked(p); onChange(p.id); setOpen(false); setInput(''); };
  const clear = () => { setPicked(null); onChange(''); };
  const close = () => { setOpen(false); setInput(''); };

  const Thumb = ({ src }: { src: string | null }) => (
    src
      ? <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" loading="lazy" decoding="async" />
      : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-muted-foreground"><Package className="h-4 w-4" /></span>
  );

  if (!open) {
    if (value) {
      return (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5">
          {brief.isLoading && needsBrief ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <Thumb src={selected?.image_url ?? null} />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selected?.name ?? (brief.isLoading ? 'Loading product...' : 'This product is no longer available')}</p>
            {selected?.price != null && <p className="text-xs text-muted-foreground">{formatNaira(Number(selected.price))}</p>}
            <p className="text-[11px] text-primary">Linked to this post</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Change</Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={clear} aria-label="Remove linked product"><X className="h-4 w-4" /></Button>
        </div>
      );
    }
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
        <Search className="h-4 w-4" /> Search a product to link (optional)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-card" onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <div className="flex items-center gap-2 border-b border-border p-2">
        <Search className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
        <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Type a product name or SKU"
          className="h-9 border-0 px-1 shadow-none focus-visible:ring-0" aria-label="Search your products" />
        {results.isFetching && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={close} aria-label="Close search"><X className="h-4 w-4" /></Button>
      </div>

      <ul role="listbox" aria-label="Your products" className="max-h-64 overflow-y-auto p-1">
        {results.isError && <li className="p-3 text-sm text-destructive">Could not load your products. Check your connection and try again.</li>}
        {results.isLoading && <li className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching...</li>}
        {results.data?.items.length === 0 && !results.isLoading && (
          <li className="p-3 text-sm text-muted-foreground">
            {term ? <>No product of yours matches &ldquo;{term}&rdquo;. Only products that are live in your shop can be linked.</> : 'You have no live products yet. Add a product first, then link it here.'}
          </li>
        )}
        {results.data?.items.map(p => (
          <li key={p.id} role="option" aria-selected={p.id === value}>
            <button type="button" onClick={() => choose(p)}
              className={cn('flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-secondary', p.id === value && 'bg-secondary')}>
              <Thumb src={p.image_url} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                {p.price != null && <span className="block text-xs text-muted-foreground">{formatNaira(Number(p.price))}</span>}
              </span>
              {p.id === value && <Check className="h-4 w-4 shrink-0 text-primary" />}
            </button>
          </li>
        ))}
      </ul>
      {results.data && results.data.total > results.data.items.length && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Showing {results.data.items.length} of {results.data.total}. Type more of the name to narrow it down.
        </p>
      )}
    </div>
  );
}
