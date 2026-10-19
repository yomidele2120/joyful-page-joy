import { useQuery, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { CACHE } from '@/lib/cachePolicy';

// Product lists show cards, so they skip the heavy columns (specs, gallery, video, SKU) and, unless asked,
// the long description. The full row is only loaded on the product page (useProduct).
const LIST_COLUMNS = 'id, name, slug, price, compare_at_price, image_url, badge, brand, category_id, vendor_id, is_featured, is_active, moq, unit, price_tiers, stock_quantity, bnpl_eligible, created_at, updated_at, is_preorder, preorder_approved, preorder_status, preorder_release_date, preorder_delivery_estimate, preorder_quantity_limit, preorder_max_per_order, preorder_terms, preorder_due_notified';
const LIST_JOINS = 'categories(name, slug), vendors(id, user_id, store_name, logo_url, is_approved, location)';

export type ProductListRow = Omit<Tables<'products'>, 'specs' | 'images' | 'video_url' | 'sku' | 'description'> & {
  description?: string | null;
  categories: { name: string; slug: string } | null;
  vendors: { id: string; user_id: string; store_name: string; logo_url: string | null; is_approved: boolean | null; location: string | null } | null;
};

export function useProducts(options?: { categorySlug?: string; featured?: boolean; badge?: string; limit?: number; search?: string; vendorId?: string; maxMoq?: number; orderBy?: 'newest' | 'oldest'; bnplOnly?: boolean; preorderOnly?: boolean; withDescription?: boolean }) {
  return useQuery({
    queryKey: ['products', options],
    ...CACHE.products,
    queryFn: async () => {
      const columns = `${LIST_COLUMNS}${options?.withDescription ? ', description' : ''}, ${LIST_JOINS}`;
      let query = supabase.from('products').select(columns).eq('is_active', true);

      // A preorder listing only appears publicly once an admin has approved it.
      query = query.or('is_preorder.eq.false,preorder_approved.eq.true');
      if (options?.bnplOnly) query = query.eq('bnpl_eligible', true).eq('is_preorder', false);
      if (options?.preorderOnly) query = query.eq('is_preorder', true).eq('preorder_approved', true).eq('preorder_status', 'open');
      if (options?.featured) query = query.eq('is_featured', true);
      if (options?.badge) query = query.eq('badge', options.badge);
      if (options?.vendorId) query = query.eq('vendor_id', options.vendorId);
      if (options?.maxMoq) query = query.lte('moq', options.maxMoq);
      if (options?.limit) query = query.limit(options.limit);
      if (options?.search) query = query.ilike('name', `%${options.search}%`);
      if (options?.categorySlug) {
        const { data: cat } = await supabase.from('categories').select('id').eq('slug', options.categorySlug).single();
        if (cat) query = query.eq('category_id', cat.id);
      }

      const { data, error } = await query.order('created_at', { ascending: options?.orderBy === 'oldest' });
      if (error) throw error;
      return (data ?? []) as unknown as ProductListRow[];
    },
  });
}

async function fetchProduct(slug: string) {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name, slug), vendors(id, user_id, store_name, whatsapp_number, phone, logo_url, is_approved, location, business_type, year_established)')
    .eq('slug', slug)
    .single();
  if (error) throw error;
  return data;
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    ...CACHE.products,
    queryFn: () => fetchProduct(slug),
    enabled: !!slug,
  });
}

/** Warm the cache for a product page, e.g. while the pointer is over its card, so opening it feels instant. */
export function prefetchProduct(client: QueryClient, slug: string) {
  if (!slug) return;
  void client.prefetchQuery({ queryKey: ['product', slug], queryFn: () => fetchProduct(slug), ...CACHE.products });
}

export function useCategories(options?: { includeHidden?: boolean }) {
  return useQuery({
    queryKey: ['categories', options?.includeHidden ? 'all' : 'visible'],
    ...CACHE.categories,
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order');
      if (error) throw error;
      // Admins can hide a category from menus and filters. Filtering here keeps the site working
      // even before the is_visible column exists.
      return (data ?? []).filter(c => options?.includeHidden || c.is_visible !== false);
    },
  });
}

// Real counts for the homepage trust strip — no invented numbers.
export function useMarketplaceStats() {
  return useQuery({
    queryKey: ['marketplace-stats'],
    ...CACHE.directory,
    queryFn: async () => {
      const [{ count: productCount }, { count: vendorCount }] = await Promise.all([
        supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('vendors').select('*', { count: 'exact', head: true }).eq('is_approved', true),
      ]);
      return { productCount: productCount ?? 0, vendorCount: vendorCount ?? 0 };
    },
  });
}

export interface SupplierSummary {
  id: string;
  user_id: string;
  store_name: string;
  logo_url: string | null;
  store_description: string | null;
  location: string | null;
  business_type: string | null;
  year_established: number | null;
  is_approved: boolean | null;
  product_count: number;
}

// Approved suppliers with a real product count (no invented numbers).
export function useSuppliers(options?: { limit?: number; search?: string }) {
  return useQuery({
    queryKey: ['suppliers', options],
    ...CACHE.directory,
    queryFn: async () => {
      let query = supabase
        .from('vendors')
        .select('id, user_id, store_name, logo_url, store_description, location, business_type, year_established, is_approved')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      if (options?.search) query = query.ilike('store_name', `%${options.search}%`);
      if (options?.limit) query = query.limit(options.limit);
      const { data: vendors, error } = await query;
      if (error) throw error;

      const ids = (vendors ?? []).map(v => v.id);
      const counts = new Map<string, number>();
      if (ids.length) {
        const { data: rows } = await supabase.from('products').select('vendor_id').eq('is_active', true).in('vendor_id', ids);
        (rows ?? []).forEach(r => { if (r.vendor_id) counts.set(r.vendor_id, (counts.get(r.vendor_id) ?? 0) + 1); });
      }
      return (vendors ?? []).map(v => ({ ...v, product_count: counts.get(v.id) ?? 0 })) as SupplierSummary[];
    },
  });
}
