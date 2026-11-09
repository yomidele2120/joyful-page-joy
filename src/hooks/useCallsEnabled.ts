import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Has an admin switched voice/video calling on? False until then, and false if the setting cannot be read. */
export function useCallsEnabled() {
  return useQuery({
    queryKey: ['calls-enabled'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('marketplace_settings').select('calls_enabled').eq('id', true).maybeSingle();
      if (error) return false;
      return data?.calls_enabled === true;
    },
    staleTime: 60_000,
  });
}
