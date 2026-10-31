// Who is calling? Checks the Supabase access token and finds the caller's vendor record, using the caller's own token
// so the database's Row Level Security decides what they may see. Needs only the public Supabase URL and anon key.
export interface Req { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> }
export interface Res { status(code: number): Res; setHeader(name: string, value: string): Res; json(body: unknown): void }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

const base = () => (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const anon = () => process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

export const supabaseFetch = (path: string, token: string, init: RequestInit = {}) =>
  fetch(`${base()}${path}`, {
    ...init, signal: AbortSignal.timeout(6000),
    headers: { apikey: anon(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers as object) },
  });

export interface Caller { userId: string; token: string; vendorId: string | null; isAdmin: boolean }

export async function authenticate(req: Req): Promise<Caller | null> {
  const token = one(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (!token || !base() || !anon()) return null;
  try {
    const u = await supabaseFetch('/auth/v1/user', token);
    if (!u.ok) return null;
    const user = (await u.json()) as { id?: string };
    if (!isUuid(user.id)) return null;
    const [v, a] = await Promise.all([
      supabaseFetch(`/rest/v1/vendors?user_id=eq.${user.id}&select=id&limit=1`, token),
      supabaseFetch('/rest/v1/rpc/has_role', token, { method: 'POST', body: JSON.stringify({ _user_id: user.id, _role: 'admin' }) }),
    ]);
    const vendors = v.ok ? ((await v.json()) as { id: string }[]) : [];
    const isAdmin = a.ok ? (await a.json()) === true : false;
    return { userId: user.id, token, vendorId: vendors[0]?.id ?? null, isAdmin };
  } catch { return null; }
}

// Best-effort limiter (per server instance): stops one account from hammering the signing endpoint.
const hits = new Map<string, number[]>();
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter(t => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowMs)) hits.delete(k);
  return recent.length > max;
}
