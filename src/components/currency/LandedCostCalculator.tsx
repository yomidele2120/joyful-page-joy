import { useState } from 'react';
import { Calculator, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatNaira } from '@/lib/format';
import { landedCost } from '@/lib/landedCost';
import { useCurrency } from '@/hooks/useCurrency';

const field = (v: string) => (v === '' ? 0 : Number(v));

// "What will this really cost me delivered?" Product + shipping + duty + insurance + VAT + other costs.
export default function LandedCostCalculator({ unitPrice, quantity, unit }: { unitPrice: number; quantity: number; unit: string }) {
  const [open, setOpen] = useState(false);
  const [shipping, setShipping] = useState('');
  const [duty, setDuty] = useState('0');
  const [insurance, setInsurance] = useState('0');
  const [vat, setVat] = useState('7.5');
  const [other, setOther] = useState('');
  const { currency, format } = useCurrency();
  const r = landedCost({
    unitPrice, quantity, shipping: field(shipping), dutyPercent: field(duty),
    vatPercent: field(vat), insurancePercent: field(insurance), otherFees: field(other),
  });
  const rows: [string, number][] = [
    [`Goods (${quantity} x ${formatNaira(unitPrice)})`, r.goods], ['Shipping', r.shipping], ['Import duty', r.duty],
    ['Insurance', r.insurance], ['VAT', r.vat], ['Other costs', r.other],
  ];
  return (
    <div className="mt-4 rounded-lg border border-border bg-card">
      <button type="button" className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-medium" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" /> Estimate total delivered cost</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Shipping (₦, whole order)"><Input inputMode="decimal" type="number" min={0} value={shipping} onChange={e => setShipping(e.target.value)} placeholder="0" /></Labeled>
            <Labeled label="Other costs (₦)"><Input inputMode="decimal" type="number" min={0} value={other} onChange={e => setOther(e.target.value)} placeholder="Clearing, delivery..." /></Labeled>
            <Labeled label="Import duty (%)"><Input inputMode="decimal" type="number" min={0} max={100} value={duty} onChange={e => setDuty(e.target.value)} /></Labeled>
            <Labeled label="Insurance (%)"><Input inputMode="decimal" type="number" min={0} max={100} value={insurance} onChange={e => setInsurance(e.target.value)} /></Labeled>
            <Labeled label="VAT (%)"><Input inputMode="decimal" type="number" min={0} max={100} value={vat} onChange={e => setVat(e.target.value)} /></Labeled>
          </div>
          <dl className="space-y-1 text-sm">
            {rows.filter(([, v], i) => i === 0 || v > 0).map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="tabular-nums">{formatNaira(Math.round(value))}</dd></div>
            ))}
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold"><dt>Estimated total</dt><dd className="tabular-nums">{formatNaira(Math.round(r.total))}</dd></div>
            {currency !== 'NGN' && <div className="flex justify-between gap-3 text-muted-foreground"><dt>In {currency}</dt><dd className="tabular-nums">{format(r.total)}</dd></div>}
            <div className="flex justify-between gap-3 text-muted-foreground"><dt>Per {unit.toLowerCase()} delivered</dt><dd className="tabular-nums">{formatNaira(Math.round(r.perUnit))}</dd></div>
          </dl>
          <p className="text-[11px] text-muted-foreground">An estimate only. Duty rates and shipping costs depend on the product and carrier; the supplier's quotation and the carrier's invoice are what you actually pay.</p>
        </div>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs text-muted-foreground"><span className="mb-1 block">{label}</span>{children}</label>;
}
