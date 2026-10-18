import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileCheck2, FileWarning } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatLagos } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SupplierTermsBox, { monthsLabel, type CurrentTerms } from '@/components/suppliers/SupplierTermsBox';

const db = supabase as any;

/** Shows the supplier their commission position and the terms they accepted. */
export default function SupplierAgreementPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<'view' | 'accept' | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [terms, setTerms] = useState<CurrentTerms | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['my-commission-status'],
    queryFn: async () => {
      const { data, error } = await db.rpc('my_commission_status');
      if (error) throw error;
      return data as any;
    },
  });

  const { data: agreement } = useQuery({
    queryKey: ['my-latest-agreement'],
    enabled: open === 'view',
    queryFn: async () => {
      const { data } = await db.from('supplier_agreements').select('*').order('accepted_at', { ascending: false }).limit(1).maybeSingle();
      return data as any;
    },
  });

  if (!status) return null;

  const accept = async () => {
    if (!terms) return;
    setBusy(true);
    const { error } = await db.rpc('accept_supplier_terms', { _terms_version: terms.version, _accepted: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Thank you. Your acceptance has been recorded.');
    setOpen(null);
    qc.invalidateQueries({ queryKey: ['my-commission-status'] });
  };

  let summary: string;
  if (!status.activated_at) {
    summary = 'Your commission-free period starts the moment your account is approved.';
  } else if (status.in_free_period) {
    summary = `Commission: 0% until ${formatLagos(status.commission_free_until)} (Nigeria time). After that: ${status.rate_after_free_period}% on the product subtotal.`;
  } else {
    summary = `Commission: ${status.current_rate}% on the product subtotal. Your free period ended on ${formatLagos(status.commission_free_until, false)}.`;
  }

  return (
    <>
      <div className={`mb-6 flex flex-wrap items-center gap-3 rounded-lg border p-4 ${status.needs_acceptance ? 'border-amber-300 bg-amber-50' : 'border-border bg-card'}`}>
        {status.needs_acceptance
          ? <FileWarning className="h-5 w-5 shrink-0 text-amber-600" />
          : <FileCheck2 className="h-5 w-5 shrink-0 text-primary" />}
        <div className="min-w-0 flex-1 text-sm">
          {status.needs_acceptance ? (
            <>
              <p className="font-medium">Please review and accept the Supplier Terms and Commission Policy (version {status.current_terms_version}).</p>
              <p className="text-muted-foreground">{status.terms_accepted_at ? 'The terms were updated since you last accepted them. ' : 'Your account cannot be approved until you accept. '}{summary}</p>
            </>
          ) : (
            <>
              <p className="font-medium">{summary}</p>
              <p className="text-muted-foreground">
                Terms version {status.terms_version} accepted on {formatLagos(status.terms_accepted_at)}.
                {status.activated_at ? ` Account activated ${formatLagos(status.activated_at)}.` : ''}
              </p>
            </>
          )}
        </div>
        {status.needs_acceptance
          ? <Button size="sm" onClick={() => { setAccepted(false); setOpen('accept'); }}>Review and accept</Button>
          : <Button size="sm" variant="outline" onClick={() => setOpen('view')}>View accepted terms</Button>}
      </div>

      <Dialog open={open === 'view'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Terms you accepted</DialogTitle></DialogHeader>
          {agreement ? (
            <>
              <p className="text-sm text-muted-foreground">
                Version {agreement.terms_version}, accepted {formatLagos(agreement.accepted_at)}. At that time:
                {' '}{monthsLabel(agreement.free_period_months)} commission-free, then {agreement.commission_percent}%.
              </p>
              <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                {String(agreement.terms_body).trim()}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">Loading...</p>}
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'accept'} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Supplier Terms and Commission Policy</DialogTitle></DialogHeader>
          <div className="max-h-[65vh] overflow-y-auto">
            <SupplierTermsBox onChange={(a, t) => { setAccepted(a); setTerms(t); }} />
          </div>
          <Button onClick={accept} disabled={!accepted || busy}>{busy ? 'Saving...' : 'Accept and continue'}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
