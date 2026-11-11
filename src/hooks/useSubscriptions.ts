import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SubscriptionRow } from '@/lib/subscriptions';

// Admin only. Opening this also makes the database send any warning that is due (expiry, low call minutes).
export function useSubscriptionOverview(enabled = true) {
  return useQuery({
    queryKey: ['subscription-overview'],
    enabled,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('subscription_overview');
      if (error) throw error;
      return (data ?? []) as SubscriptionRow[];
    },
  });
}
