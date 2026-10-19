import { useQuery } from '@tanstack/react-query';
import { CACHE } from '@/lib/cachePolicy';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import type { FlyerPlacement } from '@/lib/flyerPlacements';

export type UploadedFlyer = Tables<'flyers'>;

// A flyer is live when it is switched on and today is inside its window.
// The database already filters this for shoppers; checking again here keeps
// the page correct if the tab stays open past an end date.
export function isLive(f: UploadedFlyer, now = Date.now()) {
  if (!f.is_active) return false;
  if (f.starts_at && new Date(f.starts_at).getTime() > now) return false;
  if (f.ends_at && new Date(f.ends_at).getTime() <= now) return false;
  return true;
}

// Admin-uploaded flyers for the public site. `forPlacement` returns them in
// the order the admin set; `ready` is false only while the first load is running,
// so pages can avoid flashing the built-in flyers before the uploads arrive.
export function useFlyers() {
  const query = useQuery({
    queryKey: ['flyers', 'live'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('flyers')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    ...CACHE.flyers,
    refetchOnWindowFocus: true,
    retry: 2,
  });

  if (query.error) console.error('[flyers] could not load uploaded flyers. Has the flyers migration been applied to your Supabase project?', query.error);

  const live = (query.data ?? []).filter(f => isLive(f));
  return {
    ready: !query.isLoading,
    forPlacement: (placement: FlyerPlacement) => live.filter(f => f.placement === placement),
  };
}
