// Gives a signed-in member a short-lived ZEGOCLOUD login token. The ServerSecret never leaves this function.
// It refuses when the admin has not switched calling on, so a leftover key cannot keep calls alive.
//   POST {}              -> { appId, token, userId, userName }
//   POST { status:true } -> admin only: { calls_enabled, configured, missing }  (names of missing settings, never values)
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateToken04, toZegoUserId } from "../_shared/zegoToken.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const TOKEN_SECONDS = 24 * 60 * 60;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return reply({ error: 'Unauthorized' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: claimsData, error: claimsError } = await db.auth.getClaims(authHeader.replace('Bearer ', ''));
    const userId = claimsData?.claims?.sub as string | undefined;
    if (claimsError || !userId) return reply({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const appIdRaw = Deno.env.get('ZEGO_APP_ID')?.trim();
    const secret = Deno.env.get('ZEGO_SERVER_SECRET')?.trim();
    const appId = Number(appIdRaw);
    const missing: string[] = [];
    if (!appIdRaw || !Number.isInteger(appId) || appId <= 0) missing.push('ZEGO_APP_ID');
    if (!secret || ![16, 24, 32].includes(secret.length)) missing.push('ZEGO_SERVER_SECRET');

    const { data: settings } = await db.from('marketplace_settings').select('calls_enabled').limit(1).maybeSingle();
    const enabled = settings?.calls_enabled === true;

    if (body?.status === true) {
      const { data: isAdmin } = await db.rpc('has_role', { _user_id: userId, _role: 'admin' });
      if (!isAdmin) return reply({ error: 'Admins only' }, 403);
      return reply({ calls_enabled: enabled, configured: missing.length === 0, missing });
    }

    if (!enabled) return reply({ error: 'Calling is not switched on' }, 403);
    if (missing.length) { console.error('zego-token: not configured', missing); return reply({ error: 'Calling is not set up on the server' }, 503); }

    const [{ data: vendor }, { data: profile }] = await Promise.all([
      db.from('vendors').select('store_name').eq('user_id', userId).maybeSingle(),
      db.from('profiles').select('full_name').eq('user_id', userId).maybeSingle(),
    ]);
    const userName = String(vendor?.store_name || profile?.full_name || 'Member').slice(0, 60);
    const zegoUserId = toZegoUserId(userId);
    const token = await generateToken04(appId, zegoUserId, secret!, TOKEN_SECONDS);
    return reply({ appId, token, userId: zegoUserId, userName });
  } catch (err) {
    console.error('zego-token failed', err);
    return reply({ error: 'Could not start calling' }, 500);
  }
});
