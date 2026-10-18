import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { PublicFinance } from '@/lib/payLater';

export { bnplEligibleForPrice } from '@/lib/payLater';
export type { PublicFinance } from '@/lib/payLater';

export interface MarketplaceSettings {
  bnpl_section_visible: boolean;
  preorder_enabled: boolean;
  preorder_requires_approval: boolean;
  preorder_delay_cancel_days: number;
}

export const KLUMP_PUBLIC_KEY = import.meta.env.VITE_KLUMP_PUBLIC_KEY as string | undefined;

// Same settings the checkout uses (whole-naira rules, set by the admin under Finance).
export function usePublicFinance() {
  return useQuery({
    queryKey: ['public-finance-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_public_finance_settings');
      if (error) throw error;
      return data as unknown as PublicFinance;
    },
    staleTime: 60_000,
  });
}

export function useMarketplaceSettings() {
  return useQuery({
    queryKey: ['marketplace-settings'],
    queryFn: async (): Promise<MarketplaceSettings> => {
      const { data, error } = await supabase
        .from('marketplace_settings')
        .select('bnpl_section_visible, preorder_enabled, preorder_requires_approval, preorder_delay_cancel_days')
        .eq('id', true)
        .maybeSingle();
      if (error) throw error;
      // If the migration has not been run yet, keep the sections visible rather than hiding them.
      return data ?? { bnpl_section_visible: true, preorder_enabled: true, preorder_requires_approval: true, preorder_delay_cancel_days: 14 };
    },
    staleTime: 60_000,
  });
}

/** Is Pay later genuinely offered right now (switched on, provider key present, section visible)? */
export function usePayLaterAvailable() {
  const { data: finance } = usePublicFinance();
  const { data: settings } = useMarketplaceSettings();
  return !!KLUMP_PUBLIC_KEY && !!finance?.bnpl_enabled && settings?.bnpl_section_visible !== false;
}

// Places already taken on preorder products (counts only).
export function usePreorderTaken(productIds: string[]) {
  const key = [...productIds].sort();
  return useQuery({
    queryKey: ['preorder-taken', key],
    enabled: key.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_preorder_taken', { _product_ids: key });
      if (error) throw error;
      return new Map<string, number>((data ?? []).map(r => [r.product_id, r.taken] as [string, number]));
    },
    staleTime: 30_000,
  });
}

export function formatLongDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' });
}
