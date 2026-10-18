import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useProducts(options?: { categorySlug?: string; featured?: boolean; badge?: string; limit?: number; search?: string; vendorId?: string; maxMoq?: number; orderBy?: 'newest' | 'oldest'; bnplOnly?: boolean; preorderOnly?: boolean }) {
  return useQuery({
    queryKey: ['products', options],
    queryFn: async () => {
      let query = supabase.from('products').select('*, categories(name, slug), vendors(id, user_id, store_name, logo_url, is_approved, location)').eq('is_active', true);

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
      return data;
    },
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ['product', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug), vendors(id, user_id, store_name, whatsapp_number, phone, logo_url, is_approved, location, business_type, year_established)')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });
}

export function useCategories(options?: { includeHidden?: boolean }) {
  return useQuery({
    queryKey: ['categories', options?.includeHidden ? 'all' : 'visible'],
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
