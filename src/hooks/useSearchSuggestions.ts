import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export interface SuggestProduct { id: string; name: string; slug: string; image_url: string | null }
export interface SuggestSupplier { id: string; store_name: string; logo_url: string | null }
export interface Suggestions { products: SuggestProduct[]; suppliers: SuggestSupplier[] }

/** Makes user text safe inside an ilike pattern (so "50%" or "a_b" are searched literally). */
export const likePattern = (q: string) => `%${q.replace(/[\\%_,()]/g, ' ').replace(/\s+/g, ' ').trim()}%`;

/** Products and suppliers that match what the visitor is typing, from one search. Small and quick: 5 products, 4 suppliers. */
export function useSearchSuggestions(text: string) {
  const q = useDebouncedValue(text.trim(), 250);
  const enabled = q.length >= 2;
  const query = useQuery({
    queryKey: ['search-suggest', q], enabled, staleTime: 60_000, retry: 0,
    queryFn: async (): Promise<Suggestions> => {
      const pattern = likePattern(q);
      const [p, s] = await Promise.all([
        supabase.from('products').select('id, name, slug, image_url').eq('is_public', true).eq('is_active', true).ilike('name', pattern).limit(5),
        supabase.from('vendors').select('id, store_name, logo_url').eq('is_approved', true).ilike('store_name', pattern).limit(4),
      ]);
      return { products: (p.data ?? []) as SuggestProduct[], suppliers: (s.data ?? []) as SuggestSupplier[] };
    },
  });
  return { enabled, loading: enabled && query.isFetching, data: enabled ? query.data : undefined, settled: q === text.trim() };
}
