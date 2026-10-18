import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export interface CurrentTerms {
  version: string; title: string; body: string; free_period_months: number; commission_percent: number;
}

export function monthsLabel(n: number) {
  return `${n} calendar month${n === 1 ? '' : 's'}`;
}

/** The terms, the plain-language commission summary, and the mandatory (unticked) checkbox. */
export default function SupplierTermsBox({ onChange }: { onChange: (accepted: boolean, terms: CurrentTerms | null) => void }) {
  const [terms, setTerms] = useState<CurrentTerms | null>(null);
  const [failed, setFailed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    db.rpc('get_current_supplier_terms').then(({ data, error }: any) => {
      if (error || !data) setFailed(true); else setTerms(data as CurrentTerms);
    });
  }, []);

  useEffect(() => { cb.current(accepted && !!terms, terms); }, [accepted, terms]);

  if (failed) {
    return <p className="my-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      The Supplier Terms could not be loaded. Refresh the page to try again. You cannot register without them.
    </p>;
  }
  if (!terms) return <p className="my-4 text-sm text-slate-500">Loading the Supplier Terms...</p>;

  return (
    <div className="my-5">
      <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <p className="font-semibold">Commission, in short</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Your first <strong>{monthsLabel(terms.free_period_months)}</strong> after your account is approved are <strong>commission-free</strong>.</li>
          <li>After that, a <strong>{terms.commission_percent}% commission</strong> applies to every successful sale.</li>
          <li>Commission is charged on the product subtotal only, never on VAT or shipping.</li>
        </ul>
      </div>

      <p className="mb-1 text-sm font-medium text-slate-800">{terms.title} (version {terms.version})</p>
      <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
        {terms.body.trim()}
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={accepted}
          onChange={e => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
          required
        />
        <span>I have read and agree to the Supplier Terms and Commission Policy.</span>
      </label>
    </div>
  );
}
