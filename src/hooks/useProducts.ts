import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useProducts(options?: { categorySlug?: string; featured?: boolean; badge?: string; limit?: number; search?: string }) {
  return useQuery({
    queryKey: ['products', options],
    queryFn: async () => {
      let query = supabase.from('products').select('*, categories(name, slug)').eq('is_active', true);

      if (options?.featured) query = query.eq('is_featured', true);
      if (options?.badge) query = query.eq('badge', options.badge);
      if (options?.limit) query = query.limit(options.limit);
      if (options?.search) query = query.ilike('name', `%${options.search}%`);
      if (options?.categorySlug) {
        const { data: cat } = await supabase.from('categories').select('id').eq('slug', options.categorySlug).single();
        if (cat) query = query.eq('category_id', cat.id);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
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
        .select('*, categories(name, slug), vendors(id, store_name, whatsapp_number, phone, logo_url, is_approved)')
        .eq('slug', slug)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}
