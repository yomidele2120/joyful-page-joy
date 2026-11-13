export interface PaystackCharge {
  reference?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
}

export type PaystackChargeValidation =
  | { valid: true }
  | { valid: false; reason: 'reference_mismatch' | 'not_successful' | 'currency_mismatch' | 'amount_mismatch' };

export function validatePaystackCharge(
  charge: PaystackCharge | null | undefined,
  expected: { reference: string; amountKobo: number; currency: string },
): PaystackChargeValidation {
  if (!charge || charge.reference !== expected.reference) return { valid: false, reason: 'reference_mismatch' };
  if (charge.status !== 'success') return { valid: false, reason: 'not_successful' };
  if (typeof charge.currency !== 'string' || charge.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    return { valid: false, reason: 'currency_mismatch' };
  }
  const amount = Number(charge.amount);
  if (!Number.isSafeInteger(amount) || amount !== expected.amountKobo) return { valid: false, reason: 'amount_mismatch' };
  return { valid: true };
}