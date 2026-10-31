import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyStreamState, type StreamVideo } from "../_shared/stream.ts";

// Cloudflare Stream calls this when a video has finished optimising (or has failed). It publishes the matching
// post, so a video goes live even if the seller's phone is off or the app was closed after uploading.
// Setup: see VIDEO_UPLOAD_SETUP.md (register this URL with Cloudflare and store the signing secret).

const TOLERANCE_SECONDS = 15 * 60;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('CLOUDFLARE_STREAM_WEBHOOK_SECRET');
  if (!secret) {
    console.error('stream-webhook: CLOUDFLARE_STREAM_WEBHOOK_SECRET is not set');
    return new Response('Not configured', { status: 500 });
  }

  const body = await req.text(); // the signature covers the exact bytes, so read the raw text first
  const header = req.headers.get('Webhook-Signature') ?? '';
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=') as [string, string]));
  const time = Number(parts.time);
  const sig = parts.sig1;
  if (!sig || !Number.isFinite(time)) return new Response('Invalid signature', { status: 401 });
  if (Math.abs(Date.now() / 1000 - time) > TOLERANCE_SECONDS) return new Response('Stale request', { status: 401 });

  const expected = await hmacHex(secret, `${time}.${body}`);
  if (!safeEqual(expected, sig)) return new Response('Invalid signature', { status: 401 });

  let video: StreamVideo;
  try { video = JSON.parse(body); } catch { return new Response('Bad request', { status: 400 }); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const outcome = await applyStreamState(admin, video);
  console.log(`stream-webhook uid=${video.uid} state=${video.status?.state} -> ${outcome}`);
  return new Response(JSON.stringify({ ok: true, outcome }), { headers: { 'Content-Type': 'application/json' } });
});
