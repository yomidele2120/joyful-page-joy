import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PendingApproval { key: string; label: string; count: number; tab: string }

// Admin only. Checks every 30 seconds and whenever the admin returns to the tab.
export function useAdminApprovals(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-pending-approvals'],
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    queryFn: async (): Promise<PendingApproval[]> => {
      const { data, error } = await (supabase as any).rpc('admin_pending_approvals');
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((r: any) => ({ key: String(r.key), label: String(r.label), count: Number(r.count) || 0, tab: String(r.tab) }));
    },
  });
}
