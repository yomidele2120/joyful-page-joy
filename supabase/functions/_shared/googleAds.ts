// Server-side Google Ads API client (REST). Secrets come from Edge Function secrets and are never returned or logged.
//   GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
//   GOOGLE_ADS_LOGIN_CUSTOMER_ID (the manager account), optional GOOGLE_ADS_API_VERSION (default v25).
// Google retires API versions about every year (see developers.google.com/google-ads/api/docs/sunset-dates), so the version is a setting.

export class AdsError extends Error {
  code: string; status: number;
  constructor(message: string, code: string, status = 502) { super(message); this.code = code; this.status = status; }
}

export const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Removes anything that looks like a token or secret before text is returned or stored. */
export function scrub(text: string, secrets: string[] = []): string {
  let t = text.replace(/ya29\.[A-Za-z0-9._-]+/g, '[hidden]').replace(/1\/\/[A-Za-z0-9._-]{20,}/g, '[hidden]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [hidden]').replace(/GOCSPX-[A-Za-z0-9_-]+/g, '[hidden]');
  for (const s of secrets) if (s && s.length >= 8) t = t.split(s).join('[hidden]');
  return t.slice(0, 400);
}

export interface AdsConfig { developerToken: string; clientId: string; clientSecret: string; refreshToken: string; loginCustomerId: string; version: string }

export function readConfig(env: (k: string) => string | undefined): { config?: AdsConfig; missing: string[] } {
  const want: Array<[string, string]> = [
    ['developerToken', 'GOOGLE_ADS_DEVELOPER_TOKEN'], ['clientId', 'GOOGLE_ADS_CLIENT_ID'], ['clientSecret', 'GOOGLE_ADS_CLIENT_SECRET'],
    ['refreshToken', 'GOOGLE_ADS_REFRESH_TOKEN'], ['loginCustomerId', 'GOOGLE_ADS_LOGIN_CUSTOMER_ID'],
  ];
  const missing = want.filter(([, k]) => !(env(k) ?? '').trim()).map(([, k]) => k);
  if (missing.length) return { missing };
  const version = (env('GOOGLE_ADS_API_VERSION') ?? 'v25').trim();
  if (!/^v\d{2}$/.test(version)) return { missing: ['GOOGLE_ADS_API_VERSION (looks like v25)'] };
  const c = Object.fromEntries(want.map(([f, k]) => [f, (env(k) ?? '').trim()])) as unknown as AdsConfig;
  c.loginCustomerId = digits(c.loginCustomerId);
  c.version = version;
  if (c.loginCustomerId.length !== 10) return { missing: ['GOOGLE_ADS_LOGIN_CUSTOMER_ID (must be 10 digits, no dashes)'] };
  return { config: c, missing: [] };
}

export type Fetcher = typeof fetch;

export async function getAccessToken(c: AdsConfig, f: Fetcher = fetch): Promise<string> {
  let res: Response;
  try {
    res = await f('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch { throw new AdsError('Could not reach Google to sign in.', 'network'); }
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    const why = String(j.error ?? '');
    if (why === 'invalid_grant') throw new AdsError('Google rejected the refresh token. It may be expired, revoked or created with a different OAuth client. Create a new one in the OAuth Playground.', 'invalid_grant', 401);
    if (why === 'invalid_client') throw new AdsError('Google rejected the OAuth client ID or secret.', 'invalid_client', 401);
    throw new AdsError(`Google sign-in failed${why ? ` (${scrub(why)})` : ''}.`, 'oauth_failed', 401);
  }
  return String(j.access_token);
}

export async function adsRequest(c: AdsConfig, token: string, method: 'GET' | 'POST', path: string, body?: unknown, f: Fetcher = fetch): Promise<any> {
  let res: Response;
  try {
    res = await f(`https://googleads.googleapis.com/${c.version}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, 'developer-token': c.developerToken, 'login-customer-id': c.loginCustomerId,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000),
    });
  } catch { throw new AdsError('Could not reach the Google Ads API.', 'network'); }
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = j?.error ?? {};
    const detail = e?.details?.[0]?.errors?.[0];
    const codeObj = detail?.errorCode ? Object.entries(detail.errorCode)[0] : null;
    const code = codeObj ? `${codeObj[0]}:${codeObj[1]}` : String(e.status ?? res.status);
    const msg = scrub(String(detail?.message ?? e.message ?? 'Request failed'), [c.developerToken, c.clientSecret, c.refreshToken]);
    throw new AdsError(`Google Ads API: ${msg}`, code, res.status === 401 || res.status === 403 ? res.status : 502);
  }
  return j;
}

export const listAccessibleCustomers = (c: AdsConfig, token: string, f: Fetcher = fetch) =>
  adsRequest(c, token, 'GET', 'customers:listAccessibleCustomers', undefined, f)
    .then((j) => ((j.resourceNames ?? []) as string[]).map((r) => digits(r.split('/')[1])));

export const search = (c: AdsConfig, token: string, customerId: string, query: string, f: Fetcher = fetch) =>
  adsRequest(c, token, 'POST', `customers/${digits(customerId)}/googleAds:search`, { query, pageSize: 50 }, f).then((j) => (j.results ?? []) as any[]);
