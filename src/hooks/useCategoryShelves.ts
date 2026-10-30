import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CACHE } from '@/lib/cachePolicy';
import { LIST_COLUMNS, LIST_JOINS, useCategories, type ProductListRow } from '@/hooks/useProducts';

// Home page "shelves": one scrolling row of products per category that actually has products.

export interface CategoryShelf {
  id: string;
  name: string;
  slug: string;
}

export const SHELF_PRODUCTS = 12;

/**
 * Categories that have at least one product the shop shows right now.
 * Uses the home_category_shelves() function (migration 20261030090000). If that migration has not been
 * run yet, it falls back to the visible categories and each row hides itself when it turns out empty.
 */
export function useCategoryShelves() {
  const { data: categories } = useCategories();
  return useQuery({
    queryKey: ['category-shelves', 'list', categories?.length ?? 0],
    ...CACHE.categories,
    enabled: !!categories,
    queryFn: async (): Promise<{ shelves: CategoryShelf[]; verified: boolean }> => {
      const { data, error } = await (supabase as any).rpc('home_category_shelves', { _min_products: 1, _max_shelves: 40 });
      if (!error && Array.isArray(data)) {
        return { shelves: data.map((c: CategoryShelf) => ({ id: c.id, name: c.name, slug: c.slug })), verified: true };
      }
      return {
        shelves: (categories ?? []).map(c => ({ id: c.id, name: c.name, slug: c.slug })),
        verified: false,
      };
    },
  });
}

/** The newest products of one category. Only runs once its row is close to the screen. */
export function useCategoryShelfProducts(categoryId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['category-shelves', 'products', categoryId],
    ...CACHE.products,
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('products')
        .select(`${LIST_COLUMNS}, ${LIST_JOINS}`)
        .eq('is_public', true)
        .eq('category_id', categoryId)
        .order('created_at', { ascending: false })
        .limit(SHELF_PRODUCTS);
      if (error) throw error;
      return (data ?? []) as unknown as ProductListRow[];
    },
  });
}
