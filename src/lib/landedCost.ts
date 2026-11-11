// Landed cost = everything a buyer pays to get goods to their door: the goods, shipping, import duty, VAT and other costs.
// This is an estimate for planning. The supplier's quotation and the carrier's invoice are what is actually charged.

export interface LandedCostInput {
  unitPrice: number;      // NGN per unit
  quantity: number;
  shipping: number;       // NGN, whole shipment
  dutyPercent: number;    // import duty, % of goods value
  vatPercent: number;     // VAT, % of (goods + shipping + duty)
  insurancePercent: number; // % of goods value
  otherFees: number;      // NGN: clearing agent, port charges, local delivery, etc.
}

export interface LandedCostResult {
  goods: number; shipping: number; duty: number; insurance: number; vat: number; other: number;
  total: number; perUnit: number;
}

const num = (v: number, min = 0, max = Number.POSITIVE_INFINITY) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 0);

export function landedCost(i: LandedCostInput): LandedCostResult {
  const quantity = Math.max(1, Math.floor(num(i.quantity, 1)));
  const goods = num(i.unitPrice) * quantity;
  const shipping = num(i.shipping);
  const duty = goods * num(i.dutyPercent, 0, 100) / 100;
  const insurance = goods * num(i.insurancePercent, 0, 100) / 100;
  const other = num(i.otherFees);
  const vat = (goods + shipping + duty) * num(i.vatPercent, 0, 100) / 100;
  const total = goods + shipping + duty + insurance + vat + other;
  return { goods, shipping, duty, insurance, vat, other, total, perUnit: total / quantity };
}
