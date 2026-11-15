import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PlanUsage {
  plan_slug: string;
  plan_name: string;
  product_limit: number | null;
  product_count: number;
  pinned_limit: number;
  pinned_count: number;
  renew_hours: number | null;
}

// The seller's own plan limits and how much of them is used (the database does the counting).
export function usePlanUsage(enabled = true) {
  return useQuery({
    queryKey: ['my-plan-usage'],
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<PlanUsage | null> => {
      const { data, error } = await (supabase as any).rpc('my_plan_usage');
      if (error) throw error;
      return (data ?? null) as PlanUsage | null;
    },
  });
}
