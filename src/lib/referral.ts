import { supabase } from '@/integrations/supabase/client';

const KEY = 'ith_ref';
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const CODE_RE = /^[A-Za-z0-9_-]{4,32}$/;

/** Remember a referral code seen in a link. The server still checks it and locks it to the account. */
export function storeReferralCode(code: string | null | undefined) {
  const c = (code ?? '').trim();
  if (!CODE_RE.test(c)) return;
  try { localStorage.setItem(KEY, JSON.stringify({ code: c.toUpperCase(), at: Date.now() })); } catch { /* storage blocked */ }
}

export function readReferralCode(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; at?: number };
    if (!v.code || !v.at || Date.now() - v.at > MAX_AGE_MS) { localStorage.removeItem(KEY); return null; }
    return v.code;
  } catch { return null; }
}

export function clearReferralCode() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Attach the stored (or given) code to the signed-in supplier. Returns true when the server accepted it or ruled it out for good. */
export async function applyStoredReferral(source: 'link' | 'code_signup' = 'link', explicit?: string): Promise<boolean> {
  const code = (explicit ?? readReferralCode());
  if (!code) return true;
  const { data, error } = await (supabase as any).rpc('apply_referral_code', { _code: code, _source: source });
  if (error) return false; // not signed in yet etc.: keep the code and try again later
  if (data?.ok) { clearReferralCode(); return true; }
  // Permanent refusals: stop retrying.
  if (['already_referred', 'already_paid', 'invalid_code', 'self_referral', 'not_found', 'programme_off'].includes(data?.reason)) clearReferralCode();
  return data?.reason !== 'no_vendor';
}
