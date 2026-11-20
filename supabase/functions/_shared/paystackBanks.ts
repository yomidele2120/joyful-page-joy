// Matching a bank name typed or picked on our forms to a Paystack bank code.
const norm = (v: string) =>
  v.toLowerCase()
    .replace(/\b(plc|limited|ltd|mfb|microfinance|digital|services|bank|nigeria|of)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const ALIASES: Record<string, string> = {
  gtb: 'guaranty trust', gtbank: 'guaranty trust', gt: 'guaranty trust', uba: 'united for africa',
  fcmb: 'first city monument', first: 'first', zenith: 'zenith', access: 'access',
};

export type PaystackBank = { name: string; code: string };

export function findBank(typed: string, banks: PaystackBank[]): PaystackBank | undefined {
  let t = norm(typed);
  if (ALIASES[t]) t = ALIASES[t];
  return banks
    .map((b) => ({ b, n: norm(b.name) }))
    .filter(({ n }) => n && t && (n === t || n.includes(t) || t.includes(n)))
    .sort((x, y) => Math.abs(x.n.length - t.length) - Math.abs(y.n.length - t.length))[0]?.b;
}

let cache: { at: number; banks: PaystackBank[] } | null = null;
/** Paystack's bank list changes rarely, so each warm function instance keeps it for six hours. */
export async function loadBanks(secret: string): Promise<PaystackBank[] | null> {
  if (cache && Date.now() - cache.at < 6 * 3600_000) return cache.banks;
  try {
    const res = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=200&currency=NGN', {
      headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(10_000),
    });
    const j = await res.json();
    if (!j?.status || !Array.isArray(j.data)) return null;
    cache = { at: Date.now(), banks: j.data.map((b: any) => ({ name: String(b.name), code: String(b.code) })) };
    return cache.banks;
  } catch { return null; }
}
