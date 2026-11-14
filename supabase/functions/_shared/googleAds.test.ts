import { describe, it, expect } from 'vitest';
import { AdsError, adsRequest, digits, getAccessToken, listAccessibleCustomers, readConfig, scrub } from './googleAds.ts';

const env = (o: Record<string, string>) => (k: string) => o[k];
const full = { GOOGLE_ADS_DEVELOPER_TOKEN: 'devtoken1234', GOOGLE_ADS_CLIENT_ID: 'id.apps', GOOGLE_ADS_CLIENT_SECRET: 'GOCSPX-abcdef123456',
  GOOGLE_ADS_REFRESH_TOKEN: '1//0gABCDEFGHIJKLMNOPQRSTUV', GOOGLE_ADS_LOGIN_CUSTOMER_ID: '123-456-7890' };
const cfg = readConfig(env(full)).config!;
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('google ads client', () => {
  it('lists missing secrets and normalises the manager id', () => {
    expect(readConfig(env({})).missing.length).toBe(5);
    expect(cfg.loginCustomerId).toBe('1234567890');
    expect(cfg.version).toBe('v25');
    expect(readConfig(env({ ...full, GOOGLE_ADS_LOGIN_CUSTOMER_ID: '12345' })).config).toBeUndefined();
    expect(readConfig(env({ ...full, GOOGLE_ADS_API_VERSION: 'latest' })).config).toBeUndefined();
    expect(digits('123-456-7890')).toBe('1234567890');
  });
  it('scrubs tokens and secrets', () => {
    const t = scrub(`bad ya29.abc.def Bearer zzz ${full.GOOGLE_ADS_REFRESH_TOKEN} GOCSPX-abcdef123456 devtoken1234`, ['devtoken1234']);
    for (const s of ['ya29', 'zzz', '0gABCDEFG', 'GOCSPX', 'devtoken1234']) expect(t).not.toContain(s);
  });
  it('turns Google sign-in errors into plain messages', async () => {
    let err: AdsError | null = null;
    try { await getAccessToken(cfg, (async () => jsonRes({ error: 'invalid_grant' }, 400)) as any); } catch (e) { err = e as AdsError; }
    expect(err!.code).toBe('invalid_grant');
    err = null;
    try { await getAccessToken(cfg, (async () => jsonRes({ error: 'invalid_client' }, 401)) as any); } catch (e) { err = e as AdsError; }
    expect(err!.code).toBe('invalid_client');
    expect(await getAccessToken(cfg, (async () => jsonRes({ access_token: 'ya29.ok' })) as any)).toBe('ya29.ok');
  });
  it('sends the required headers and parses accessible customers', async () => {
    let seen: any = null;
    const f = (async (url: string, init: any) => { seen = { url, headers: init.headers }; return jsonRes({ resourceNames: ['customers/1112223333', 'customers/1234567890'] }); }) as any;
    const ids = await listAccessibleCustomers(cfg, 'tok', f);
    expect(ids).toEqual(['1112223333', '1234567890']);
    expect(seen.url).toBe('https://googleads.googleapis.com/v25/customers:listAccessibleCustomers');
    expect(seen.headers['developer-token']).toBe('devtoken1234');
    expect(seen.headers['login-customer-id']).toBe('1234567890');
    expect(seen.headers.Authorization).toBe('Bearer tok');
  });
  it('reports the Google error code without leaking secrets', async () => {
    const body = { error: { status: 'PERMISSION_DENIED', message: 'x', details: [{ errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' }, message: 'The developer token is only approved for test accounts. devtoken1234' }] }] } };
    let err: AdsError | null = null;
    try { await adsRequest(cfg, 't', 'GET', 'x', undefined, (async () => jsonRes(body, 403)) as any); } catch (e) { err = e as AdsError; }
    expect(err!.code).toBe('authorizationError:DEVELOPER_TOKEN_NOT_APPROVED');
    expect(err!.message).not.toContain('devtoken1234');
    expect(err!.status).toBe(403);
  });
});
