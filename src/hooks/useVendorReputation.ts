import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface VendorReputation {
  average_rating: number | null;
  review_count: number;
  average_response_minutes: number | null;
}

export function useVendorReputation(vendorId: string | null | undefined) {
  return useQuery({
    queryKey: ['vendor-reputation', vendorId],
    queryFn: async () => {
      if (!vendorId) throw new Error('Supplier ID is required');
      const { data, error } = await supabase.rpc('get_vendor_reputation', { _vendor: vendorId });
      if (error) throw error;
      return data[0] ?? null;
    },
    enabled: !!vendorId,
    staleTime: 60_000,
  });
}

export function formatResponseTime(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 60) return `Replies in about ${Math.max(1, Math.round(minutes))} min`;
  const hours = minutes / 60;
  if (hours < 48) return `Replies in about ${Math.round(hours)} hr`;
  return `Replies in about ${Math.round(hours / 24)} days`;
}
