import { BadgeCheck, Crown, Medal } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type SupplierTier = 'free' | 'silver' | 'premium';

// Public read of the vendor's current plan. The database function already falls back to Free
// when a paid plan has expired or been suspended, so an expired vendor never keeps a paid badge.
export function useSupplierTier(vendorId?: string) {
  return useQuery({
    queryKey: ['supplier-tier', vendorId],
    enabled: !!vendorId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SupplierTier> => {
      const { data, error } = await (supabase as any).rpc('effective_supplier_plan', { _vendor_id: vendorId });
      if (error) return 'free';
      return data === 'silver' || data === 'premium' ? data : 'free';
    },
  });
}

const TIERS: Record<SupplierTier, { label: string; full: string; Icon: typeof BadgeCheck; cls: string; icon: string; title: string }> = {
  free: {
    label: 'Verified', full: 'Verified Supplier', Icon: BadgeCheck,
    cls: 'border-emerald-600/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300', icon: 'text-emerald-700 dark:text-emerald-300',
    title: 'This supplier has been verified by IT Hub Africa',
  },
  silver: {
    label: 'Silver', full: 'Silver Supplier', Icon: Medal,
    cls: 'border-slate-400/50 bg-gradient-to-r from-slate-300/30 to-slate-100/40 text-slate-700 dark:from-slate-500/30 dark:to-slate-400/10 dark:text-slate-200', icon: 'text-slate-500 dark:text-slate-300',
    title: 'Verified Silver member of IT Hub Africa',
  },
  premium: {
    label: 'Premium', full: 'Premium Supplier', Icon: Crown,
    cls: 'border-amber-500/50 bg-gradient-to-r from-amber-400/30 to-yellow-200/40 text-amber-900 dark:from-amber-500/30 dark:to-yellow-400/10 dark:text-amber-200', icon: 'text-amber-600 dark:text-amber-300',
    title: 'Verified Premium member of IT Hub Africa',
  },
};

export default function VerifiedSupplierBadge({ prominent = false, tier = 'free' }: { prominent?: boolean; tier?: SupplierTier }) {
  const t = TIERS[tier];
  return (
    <span
      title={t.title}
      data-tier={tier}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-semibold shadow-sm ${t.cls} ${
        prominent ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'
      }`}
    >
      <t.Icon className={`shrink-0 ${t.icon} ${prominent ? 'h-4 w-4' : 'h-3 w-3'}`} aria-hidden="true" />
      {prominent ? t.full : t.label}
    </span>
  );
}
