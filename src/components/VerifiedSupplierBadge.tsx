import { BadgeCheck } from 'lucide-react';

export default function VerifiedSupplierBadge({ prominent = false }: { prominent?: boolean }) {
  return (
    <span
      title="This supplier has been verified by IT Hub Africa"
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-600/25 bg-gradient-to-r from-emerald-500/15 to-amber-400/20 font-semibold text-emerald-800 shadow-sm dark:text-emerald-300 ${
        prominent ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]'
      }`}
    >
      <BadgeCheck
        className={`shrink-0 text-emerald-700 dark:text-emerald-300 ${prominent ? 'h-4 w-4' : 'h-3 w-3'}`}
        aria-hidden="true"
      />
      {prominent ? 'Verified Supplier' : 'Verified'}
    </span>
  );
}
