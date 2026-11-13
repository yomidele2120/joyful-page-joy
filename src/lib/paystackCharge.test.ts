import { describe, expect, it } from 'vitest';
import { validatePaystackCharge } from '../../supabase/functions/_shared/paystackCharge';

const expected = { reference: 'itha_1762800000000_ab12cd', amountKobo: 250000, currency: 'NGN' };
const charge = { reference: expected.reference, amount: expected.amountKobo, currency: expected.currency, status: 'success' };

describe('Paystack charge validation', () => {
  it('accepts only a successful charge matching the recorded reference, amount, and currency', () => {
    expect(validatePaystackCharge(charge, expected)).toEqual({ valid: true });
  });

  it('rejects another reference, an unsuccessful status, an under/overpayment, or wrong currency', () => {
    expect(validatePaystackCharge({ ...charge, reference: 'other' }, expected)).toMatchObject({ reason: 'reference_mismatch' });
    expect(validatePaystackCharge({ ...charge, status: 'reversed' }, expected)).toMatchObject({ reason: 'not_successful' });
    expect(validatePaystackCharge({ ...charge, amount: expected.amountKobo + 1 }, expected)).toMatchObject({ reason: 'amount_mismatch' });
    expect(validatePaystackCharge({ ...charge, amount: expected.amountKobo - 1 }, expected)).toMatchObject({ reason: 'amount_mismatch' });
    expect(validatePaystackCharge({ ...charge, currency: 'USD' }, expected)).toMatchObject({ reason: 'currency_mismatch' });
  });
});