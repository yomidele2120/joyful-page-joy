// Admin-only connection test for the Google Ads API. It reads secrets, signs in, lists the accounts the sign-in can reach
// and reads the manager account's name. It changes nothing in Google Ads and never returns a secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { AdsError, getAccessToken, listAccessibleCustomers, readConfig, search } from '../_shared/googleAds.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return reply({ error: 'Please sign in.' }, 401);
  const url = Deno.env.get('SUPABASE_URL')!;
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const { data: claims, error: claimsError } = await userClient.auth.getClaims(authHeader.replace(/^Bearer\s+/i, ''));
  const userId = claims?.claims?.sub;
  if (claimsError || !userId) return reply({ error: 'Please sign in.' }, 401);
  const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
  if (!isAdmin) return reply({ error: 'Admins only.' }, 403);

  const { config, missing } = readConfig((k) => Deno.env.get(k));
  if (!config) return reply({ ok: false, step: 'secrets', error: 'Missing or invalid secrets.', missing }, 200);

  const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [{ step: 'secrets', ok: true, detail: { apiVersion: config.version } }];
  try {
    const token = await getAccessToken(config);
    steps.push({ step: 'sign_in', ok: true });
    const accessible = await listAccessibleCustomers(config, token);
    steps.push({ step: 'accessible_accounts', ok: true, detail: { count: accessible.length, ids: accessible.slice(0, 20), includesManager: accessible.includes(config.loginCustomerId) } });
    const rows = await search(config, token, config.loginCustomerId, 'SELECT customer.id, customer.descriptive_name, customer.manager, customer.test_account FROM customer LIMIT 1');
    const c = rows[0]?.customer ?? {};
    steps.push({ step: 'manager_account', ok: true, detail: { id: c.id, name: c.descriptiveName ?? null, isManager: !!c.manager, isTestAccount: !!c.testAccount } });
    return reply({ ok: true, steps });
  } catch (e) {
    const known = e instanceof AdsError ? e : null;
    steps.push({ step: 'failed', ok: false, detail: { code: known?.code ?? 'internal_error', message: known?.message ?? 'Unexpected error.' } });
    return reply({ ok: false, steps }, 200);
  }
});
