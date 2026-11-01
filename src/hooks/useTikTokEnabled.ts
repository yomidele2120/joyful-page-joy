import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Has an admin switched the seller TikTok feature on? False until then, and false if the setting cannot be read. */
export function useTikTokEnabled() {
  return useQuery({
    queryKey: ['tiktok-enabled'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('marketplace_settings').select('tiktok_enabled').eq('id', true).maybeSingle();
      if (error) return false;
      return data?.tiktok_enabled === true;
    },
    staleTime: 60_000,
  });
}
