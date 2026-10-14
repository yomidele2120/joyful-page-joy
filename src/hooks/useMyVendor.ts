import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// The signed-in user's vendor record (null for buyers).
export function useMyVendor() {
  const { user, isVendor } = useAuth();
  return useQuery({
    queryKey: ['my-vendor', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, user_id, store_name, logo_url, is_approved')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && isVendor,
  });
}
