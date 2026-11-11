import { useCallback, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatInCurrency, isCurrencyCode, type CurrencyCode, type RateMap } from '@/lib/currency';

// The member's chosen display currency, remembered in this browser. Charges are always in Naira.
const KEY = 'displayCurrency';
const listeners = new Set<() => void>();
let current: CurrencyCode = 'NGN';
try { const saved = localStorage.getItem(KEY); if (isCurrencyCode(saved)) current = saved; } catch { /* storage unavailable */ }

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getSnapshot = () => current;
export function setDisplayCurrency(code: CurrencyCode) {
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* ignore */ }
  listeners.forEach(fn => fn());
}

export function useCurrencyRates() {
  return useQuery({
    queryKey: ['currency-rates'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('currency_rates').select('code, per_ngn, updated_at');
      if (error) throw error;
      const rates: RateMap = {};
      let updatedAt: string | null = null;
      for (const row of data ?? []) {
        if (isCurrencyCode(row.code)) rates[row.code] = Number(row.per_ngn);
        if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
      }
      return { rates, updatedAt };
    },
    staleTime: 10 * 60_000,
  });
}

export function useCurrency() {
  const currency = useSyncExternalStore(subscribe, getSnapshot, () => 'NGN' as CurrencyCode);
  const { data } = useCurrencyRates();
  const rates = data?.rates ?? {};
  const format = useCallback((amountNgn: number) => formatInCurrency(amountNgn, currency, rates), [currency, data]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { currency, setCurrency: setDisplayCurrency, rates, updatedAt: data?.updatedAt ?? null, format };
}
