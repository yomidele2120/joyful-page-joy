// Banks supported for automatic Paystack subaccount creation.
// Keep these names in sync with the bank-code table in
// supabase/functions/create-subaccount/index.ts.
export const BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank', 'FCMB',
  'Guaranty Trust Bank', 'Heritage Bank', 'Keystone Bank', 'Kuda', 'Moniepoint',
  'Opay', 'Palmpay', 'Polaris Bank', 'Stanbic IBTC', 'Standard Chartered',
  'Sterling Bank', 'Union Bank', 'United Bank for Africa', 'Unity Bank',
  'Wema Bank', 'Zenith Bank',
] as const;

export const BANK_PLACEHOLDER = 'Select your bank';
export const isValidAccountNumber = (v: string) => /^\d{10}$/.test(v.trim());
