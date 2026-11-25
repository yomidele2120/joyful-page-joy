// Asks the banner worker to run now. Called by the site right after someone asks for a new banner, so it starts at once
// instead of waiting for the next scheduled run. Any signed-in member may call it; it only wakes the worker, which does its
// own checks and only handles jobs already waiting in the queue.
import { createClient } from "npm:@supabase/supabase-js@2";
import { kickAdWorker } from "../_shared/adKick.ts";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth) return reply({ error: 'Unauthorized' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await db.auth.getClaims(auth.replace('Bearer ', ''));
    if (error || !data?.claims?.sub) return reply({ error: 'Unauthorized' }, 401);
    kickAdWorker();
    return reply({ ok: true });
  } catch (e) {
    console.error('ad-kick failed', e);
    return reply({ error: 'Could not start the banner worker' }, 500);
  }
});
