import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AccountLookup =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'verified'; name: string }
  | { state: 'not_found' }
  | { state: 'bank_unsupported' }
  | { state: 'unavailable'; detail?: string };   // Paystack could not be reached: the supplier may type the name instead

/** Asks Paystack (through our server) for the account holder's name as soon as the bank and 10 digits are filled in. */
export function useBankAccountName(bank: string, accountNumber: string): AccountLookup {
  const [result, setResult] = useState<AccountLookup>({ state: 'idle' });
  const seq = useRef(0);
  useEffect(() => {
    const ready = !!bank && /^\d{10}$/.test(accountNumber);
    if (!ready) { setResult({ state: 'idle' }); return; }
    const my = ++seq.current;
    setResult({ state: 'checking' });
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke('resolve-bank-account', { body: { bank_name: bank, account_number: accountNumber } });
        if (my !== seq.current) return;                       // the supplier changed the bank or number meanwhile
        if (error || !data) { setResult({ state: 'unavailable', detail: 'The lookup service is not deployed or not reachable' }); return; }
        if (data.ok) setResult({ state: 'verified', name: String(data.account_name) });
        else if (data.code === 'not_found') setResult({ state: 'not_found' });
        else if (data.code === 'bank_unsupported') setResult({ state: 'bank_unsupported' });
        else setResult({ state: 'unavailable', detail: typeof data.detail === 'string' ? data.detail : undefined });
      } catch { if (my === seq.current) setResult({ state: 'unavailable' }); }
    }, 400);
    return () => clearTimeout(t);
  }, [bank, accountNumber]);
  return result;
}

export function lookupMessage(r: AccountLookup): string | null {
  switch (r.state) {
    case 'checking': return 'Checking your account with Paystack...';
    case 'not_found': return 'We could not find this account. Check the bank and the account number.';
    case 'bank_unsupported': return 'This bank is not supported for automatic checks. Choose another bank.';
    case 'unavailable': return `The automatic check is not available right now${r.detail ? ` (${r.detail})` : ''}. Type the account name exactly as your bank shows it.`;
    default: return null;
  }
}
