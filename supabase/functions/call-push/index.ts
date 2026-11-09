// Sends a "someone is calling you" alert (Web Push) to the devices of the person being called.
// The caller's browser asks for it only when the other person's site is not open (so the in-site ring could not reach them).
//   POST { callId } -> { sent, total }  (or { sent: 0, reason } when nothing was sent)
// Safety: only the CALLER of a fresh, still-ringing call can trigger it, once per call, and only to that call's callee.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (for example mailto:you@yourdomain.com).
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const FRESH_SECONDS = 120;   // a call older than this is not worth an alert
const RING_SECONDS = 60;     // how long the alert is worth showing

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
    const callId = String(body?.callId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(callId)) return reply({ error: 'Bad request' }, 400);

    const pub = Deno.env.get('VAPID_PUBLIC_KEY')?.trim();
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')?.trim();
    const subject = Deno.env.get('VAPID_SUBJECT')?.trim();
    const missing = [!pub && 'VAPID_PUBLIC_KEY', !priv && 'VAPID_PRIVATE_KEY', !subject && 'VAPID_SUBJECT'].filter(Boolean);
    if (missing.length) { console.error('call-push: not configured', missing); return reply({ error: 'Call alerts are not set up on the server', missing }, 503); }

    const { data: settings } = await db.from('marketplace_settings').select('calls_enabled').limit(1).maybeSingle();
    if (settings?.calls_enabled !== true) return reply({ error: 'Calling is not switched on' }, 403);

    const { data: call } = await db.from('call_logs')
      .select('id, caller_id, callee_id, call_type, status, ended_at, created_at, push_sent_at').eq('id', callId).maybeSingle();
    if (!call || call.caller_id !== userId) return reply({ error: 'Not found' }, 404);
    if (call.status !== 'ringing' || call.ended_at) return reply({ sent: 0, reason: 'not_ringing' });
    if (Date.now() - new Date(call.created_at).getTime() > FRESH_SECONDS * 1000) return reply({ sent: 0, reason: 'too_old' });

    // One alert per call: whoever sets push_sent_at first sends it.
    const { data: claimed } = await db.from('call_logs').update({ push_sent_at: new Date().toISOString() })
      .eq('id', callId).is('push_sent_at', null).select('id');
    if (!claimed?.length) return reply({ sent: 0, reason: 'already_sent' });

    const { data: subs } = await db.from('push_subscriptions')
      .select('id, endpoint, p256dh_key, auth_key').eq('user_id', call.callee_id).limit(10);
    if (!subs?.length) return reply({ sent: 0, total: 0, reason: 'no_devices' });

    const [{ data: vendor }, { data: profile }] = await Promise.all([
      db.from('vendors').select('store_name').eq('user_id', userId).maybeSingle(),
      db.from('profiles').select('full_name').eq('user_id', userId).maybeSingle(),
    ]);
    const name = String(vendor?.store_name || profile?.full_name || 'Someone').slice(0, 60);

    webpush.setVapidDetails(subject!, pub!, priv!);
    const payload = JSON.stringify({
      type: 'incoming_call', callId, callType: call.call_type, name,
      expiresAt: Date.now() + RING_SECONDS * 1000,
    });

    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } },
          payload, { TTL: RING_SECONDS, urgency: 'high' },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode;
        console.warn('call-push: send failed', status);
        if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('id', s.id);   // the device removed the permission
      }
    }));
    return reply({ sent, total: subs.length });
  } catch (err) {
    console.error('call-push failed', err);
    return reply({ error: 'Could not send the alert' }, 500);
  }
});
