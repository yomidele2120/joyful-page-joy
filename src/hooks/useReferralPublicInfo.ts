import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ReferralPublicInfo = {
  programme_enabled: boolean;
  applications_open: boolean;
  hold_days: number;
  min_withdrawal_kobo: number;
  withdrawal_fee_kobo: number;
  terms_note: string | null;
  rate_percent: number | null; // null unless an admin chose to show the standard rate publicly
};

// What the public may know about the referral programme. Read live from the database, so the page can never show
// a number the admin did not set. The standard rate is hidden unless the admin turns it on.
export function useReferralPublicInfo() {
  return useQuery<ReferralPublicInfo | null>({
    queryKey: ['referral-public-info'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('referral_public_info');
      if (error) return null;
      return (data ?? null) as ReferralPublicInfo | null;
    },
  });
}
