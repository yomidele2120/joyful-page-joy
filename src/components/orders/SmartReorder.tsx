import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCart } from '@/contexts/CartContext';
import { useCurrency } from '@/hooks/useCurrency';
import { reorderQuantity, reorderReason, type ReorderSuggestion } from '@/lib/reorder';

// "Time to reorder": products this buyer has bought before and is probably running low on, based on how often they order.
export default function SmartReorder() {
  const { user } = useAuth();
  const { addItem, items } = useCart();
  const { format } = useCurrency();
  const { data } = useQuery({
    queryKey: ['reorder-suggestions', user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('suggest_reorders', { _limit: 6 });
      if (error) throw error;
      return (data ?? []) as ReorderSuggestion[];
    },
  });
  if (!data?.length) return null;

  const add = (s: ReorderSuggestion) => {
    if (items.some(i => i.is_preorder)) { toast.error('Check out your preorder first, then add this.'); return; }
    const qty = reorderQuantity(s);
    addItem({ id: s.product_id, name: s.name, price: s.price, image_url: s.image_url ?? '', slug: s.slug, moq: s.moq, unit: s.unit, price_tiers: s.price_tiers as any } as any, qty);
    toast.success(`Added ${qty} x ${s.name} to your cart`);
  };

  return (
    <section className="mt-5 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h2 className="flex items-center gap-2 font-heading text-base font-semibold"><RefreshCw className="h-4 w-4 text-primary" /> Time to reorder?</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {data.map(s => (
          <li key={s.product_id} className="flex items-center gap-3 rounded-md bg-card p-2.5">
            {s.image_url ? <img src={s.image_url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" loading="lazy" /> : <div className="h-12 w-12 shrink-0 rounded bg-secondary" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">{reorderReason(s)}</p>
              <p className="text-xs">{reorderQuantity(s)} {s.unit.toLowerCase()}(s) from {format(s.price)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => add(s)}>Reorder</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
