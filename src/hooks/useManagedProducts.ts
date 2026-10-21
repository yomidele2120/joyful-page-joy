import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cleanLike } from '@/lib/productSearch';

// One page of products for the ADMIN list (every supplier, live and hidden) or a SUPPLIER's own list.
// The database does the searching and paging, so these screens stay fast with millions of products.
// (Before, they downloaded every product, and Supabase silently stops at 1,000 rows.)

export const MANAGE_PAGE_SIZE = 25;
/** Deeper pages get slow on millions of rows and nobody pages that far by hand: search instead. */
export const MAX_MANAGE_PAGES = 200;

export interface ManagedProduct {
  id: string; name: string; slug: string; price: number; compare_at_price: number | null;
  moq: number | null; unit: string | null; price_tiers: unknown; stock_quantity: number | null;
  image_url: string | null; thumb_url: string | null; created_at: string;
  is_active: boolean | null; bnpl_eligible: boolean | null;
  is_preorder: boolean; preorder_approved: boolean; preorder_status: string;
  preorder_release_date: string | null; preorder_delivery_estimate: string | null;
  preorder_quantity_limit: number | null; preorder_max_per_order: number | null; preorder_terms: string | null;
  categories: { name: string } | null;
  vendors: { store_name: string } | null;
}

const COLUMNS =
  'id, name, slug, price, compare_at_price, moq, unit, price_tiers, stock_quantity, image_url, thumb_url, created_at, is_active, bnpl_eligible, ' +
  'is_preorder, preorder_approved, preorder_status, preorder_release_date, preorder_delivery_estimate, ' +
  'preorder_quantity_limit, preorder_max_per_order, preorder_terms, categories(name), vendors(store_name)';

export function useManagedProducts(opts: { page: number; search?: string; vendorId?: string; enabled?: boolean; scope: 'admin' | 'vendor' }) {
  const page = Math.min(Math.max(1, opts.page), MAX_MANAGE_PAGES);
  const term = cleanLike(opts.search ?? '');
  return useQuery({
    // The first key part is what the dashboards invalidate after an edit.
    queryKey: [opts.scope === 'admin' ? 'admin-products' : 'vendor-products', opts.vendorId ?? 'all', page, term],
    enabled: opts.enabled !== false && (opts.scope === 'admin' || !!opts.vendorId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const from = (page - 1) * MANAGE_PAGE_SIZE;
      let q: any = (supabase as any).from('products').select(COLUMNS, { count: 'estimated' });
      if (opts.vendorId) q = q.eq('vendor_id', opts.vendorId);
      if (term) q = q.ilike('name', `%${term}%`);
      const { data, error, count } = await q
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .range(from, from + MANAGE_PAGE_SIZE - 1);
      if (error) throw error;
      const items = (data ?? []) as ManagedProduct[];
      const total = Math.max(count ?? 0, items.length ? from + items.length : 0);
      const raw = Math.max(1, Math.ceil(total / MANAGE_PAGE_SIZE));
      return { items, total, pageCount: Math.min(raw, MAX_MANAGE_PAGES), capped: raw > MAX_MANAGE_PAGES };
    },
  });
}
