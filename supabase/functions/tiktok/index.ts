import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cloudinaryConfigured, uploadRemoteImage } from "../_shared/cloudinary.ts";

// TikTok integration for vendors (Login Kit + Display API). One function, several actions (POST { action, ... }):
//   start        -> { url }               where to send the vendor to approve access on TikTok
//   connect      { code, state }          finishes the connection (called from /tiktok/callback)
//   list         { cursor? }              the vendor's TikTok videos, newest first, with `selected` flags (nothing is stored)
//   select       { video_ids }            show these videos in the shop and feed (stored as posts, media_type 'tiktok')
//   unselect     { video_ids }            stop showing them (their feed posts are deleted)
//   sync                                  refresh titles/covers of chosen videos; remove ones deleted on TikTok; add new ones when auto mode is on
//   config_status                         (admins) are the TikTok keys set on the server? { configured }
//   set_auto     { enabled }              turn "automatically show my new TikTok videos" on or off
//   disconnect                            revoke access at TikTok and remove tokens + every TikTok post of this vendor
//   sync_all     (header x-cron-secret)   same as sync for every connected vendor (scheduled, see TIKTOK_SETUP.md)
//
// Secrets (supabase secrets set ...): TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI, TIKTOK_CRON_SECRET.
// Tokens are only ever read here, with the service role. They are never returned or logged.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

class UserError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const TT = "https://open.tiktokapis.com";
const SCOPES = "user.info.basic,video.list";
const VIDEO_FIELDS = "id,title,video_description,duration,cover_image_url,share_url,embed_link,create_time";
const MAX_SELECTED = 50;
const AUTO_BATCH = 10; // newest videos added per run in auto mode, so switching it on never floods the feed
const ID = /^\d{6,25}$/;

const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cfg = () => {
  const key = Deno.env.get("TIKTOK_CLIENT_KEY"), secret = Deno.env.get("TIKTOK_CLIENT_SECRET"), redirect = Deno.env.get("TIKTOK_REDIRECT_URI");
  if (!key || !secret || !redirect) throw new UserError("TikTok is not set up on the server yet.", 501);
  return { key, secret, redirect };
};

// ---- TikTok HTTP helpers -----------------------------------------------------------------------------------------------
async function tokenRequest(params: Record<string, string>) {
  const { key, secret } = cfg();
  const res = await fetch(`${TT}/v2/oauth/token/`, {
    method: "POST", signal: AbortSignal.timeout(15_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
    body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error || !j.access_token) {
    throw new UserError(j.error_description || "TikTok did not accept the request.", 400);
  }
  return j as { access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number; open_id: string; scope?: string };
}

async function ttApi(path: string, accessToken: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${TT}${path}`, {
    method: init.method ?? "GET", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const j = await res.json().catch(() => ({}));
  const code = j?.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    const e = new UserError(j?.error?.message || `TikTok request failed (${res.status})`, res.status === 401 ? 401 : 502);
    (e as UserError & { ttCode?: string }).ttCode = code;
    throw e;
  }
  return j.data ?? {};
}

// ---- tokens --------------------------------------------------------------------------------------------------------------
async function saveTokens(db: ReturnType<typeof admin>, vendorId: string, t: Awaited<ReturnType<typeof tokenRequest>>) {
  const now = Date.now();
  const { error } = await db.from("vendor_tiktok_tokens").upsert({
    vendor_id: vendorId, access_token: t.access_token, refresh_token: t.refresh_token,
    access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(now + t.refresh_expires_in * 1000).toISOString(),
    scope: t.scope ?? SCOPES, updated_at: new Date(now).toISOString(),
  });
  if (error) throw error;
}

async function markReconnect(db: ReturnType<typeof admin>, vendorId: string, why: string) {
  await db.from("vendor_tiktok_connections").update({ needs_reconnect: true, last_error: why }).eq("vendor_id", vendorId);
}

/** A working access token for this vendor, refreshing it when it is about to expire. */
async function accessToken(db: ReturnType<typeof admin>, vendorId: string, force = false): Promise<string> {
  const { data: row } = await db.from("vendor_tiktok_tokens").select("*").eq("vendor_id", vendorId).maybeSingle();
  if (!row) throw new UserError("TikTok is not connected.", 409);
  const expiresSoon = new Date(row.access_expires_at).getTime() - Date.now() < 5 * 60_000;
  if (!force && !expiresSoon) return row.access_token;
  if (new Date(row.refresh_expires_at).getTime() < Date.now()) {
    await markReconnect(db, vendorId, "TikTok access expired");
    throw new UserError("Your TikTok connection expired. Please connect again.", 409);
  }
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
    await saveTokens(db, vendorId, t);
    await db.from("vendor_tiktok_connections").update({ needs_reconnect: false, last_error: null }).eq("vendor_id", vendorId);
    return t.access_token;
  } catch (e) {
    if (e instanceof UserError) { await markReconnect(db, vendorId, "TikTok refused to renew access"); throw new UserError("Your TikTok connection needs to be renewed. Please connect again.", 409); }
    throw e;
  }
}

/** Calls the Display API with the vendor's token; renews the token once if TikTok says it is invalid. */
async function ttForVendor(db: ReturnType<typeof admin>, vendorId: string, path: string, init: { method?: string; body?: unknown } = {}) {
  let token = await accessToken(db, vendorId);
  try { return await ttApi(path, token, init); }
  catch (e) {
    if ((e as { ttCode?: string }).ttCode === "access_token_invalid" || (e as UserError).status === 401) {
      token = await accessToken(db, vendorId, true);
      return await ttApi(path, token, init);
    }
    throw e;
  }
}

// ---- video -> post ---------------------------------------------------------------------------------------------------------
interface TTVideo { id: string; title?: string; video_description?: string; duration?: number; cover_image_url?: string; share_url?: string; embed_link?: string; create_time?: number }

const hashtagsOf = (text: string) =>
  [...new Set([...text.matchAll(/#([\p{L}\p{N}_]{1,40})/gu)].map((m) => m[1].toLowerCase()))].slice(0, 10);

function postFields(v: TTVideo) {
  const text = (v.title || v.video_description || "").trim();
  return {
    tiktok_video_id: v.id,
    tiktok_embed_url: `https://www.tiktok.com/embed/v2/${v.id}`, // built from the numeric id, never copied from a response
    caption: text.slice(0, 2000) || null,
    hashtags: hashtagsOf(`${v.title ?? ""} ${v.video_description ?? ""}`),
    thumbnail_url: typeof v.cover_image_url === "string" && v.cover_image_url.startsWith("https://") ? v.cover_image_url : null,
    duration_seconds: typeof v.duration === "number" ? v.duration : null,
  };
}

/** TikTok cover links expire. When Cloudinary is set up, keep a permanent copy; if that fails we fall back to TikTok's own link. */
async function permanentCover(vendorId: string, v: TTVideo, current?: string | null): Promise<string | null> {
  if (current && current.startsWith("https://res.cloudinary.com/")) return current; // already copied
  const cover = typeof v.cover_image_url === "string" && v.cover_image_url.startsWith("https://") ? v.cover_image_url : null;
  if (!cover || !cloudinaryConfigured()) return cover;
  try { return (await uploadRemoteImage(cover, vendorId, "tiktok", v.id)).url; }
  catch { return cover; }
}

async function queryVideos(db: ReturnType<typeof admin>, vendorId: string, ids: string[]): Promise<TTVideo[]> {
  const out: TTVideo[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const data = await ttForVendor(db, vendorId, `/v2/video/query/?fields=${VIDEO_FIELDS}`, { method: "POST", body: { filters: { video_ids: ids.slice(i, i + 20) } } });
    out.push(...((data.videos ?? []) as TTVideo[]));
  }
  return out;
}

// ---- actions -------------------------------------------------------------------------------------------------------------------
async function actionStart(db: ReturnType<typeof admin>, vendorId: string) {
  const { key, redirect } = cfg();
  await db.from("tiktok_oauth_states").delete().lt("created_at", new Date(Date.now() - 60 * 60_000).toISOString()); // tidy old ones
  const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { error } = await db.from("tiktok_oauth_states").insert({ state, vendor_id: vendorId });
  if (error) throw error;
  const url = new URL("https://www.tiktok.com/v2/auth/authorize/");
  url.search = new URLSearchParams({ client_key: key, scope: SCOPES, response_type: "code", redirect_uri: redirect, state }).toString();
  return { url: url.toString() };
}

async function actionConnect(db: ReturnType<typeof admin>, vendorId: string, body: Record<string, unknown>) {
  const code = typeof body.code === "string" ? body.code : "", state = typeof body.state === "string" ? body.state : "";
  if (!code || !/^[a-f0-9]{64}$/.test(state)) throw new UserError("The TikTok link is not valid. Please start again.");
  // The state must be ours, unused, created for THIS vendor in the last 15 minutes. It is deleted so it works once.
  const { data: st } = await db.from("tiktok_oauth_states").select("vendor_id, created_at").eq("state", state).maybeSingle();
  await db.from("tiktok_oauth_states").delete().eq("state", state);
  if (!st || st.vendor_id !== vendorId || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) {
    throw new UserError("This TikTok link expired or belongs to another session. Please start again.");
  }
  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: cfg().redirect });
  if (!(tokens.scope ?? "").split(",").includes("video.list")) throw new UserError("Please allow access to your videos so they can be shown in your shop.");
  const info = await ttApi("/v2/user/info/?fields=open_id,display_name,avatar_url", tokens.access_token);
  const user = (info.user ?? {}) as { open_id?: string; display_name?: string; avatar_url?: string };

  // One TikTok account can only be linked to one shop: otherwise two shops could show the same videos.
  const openId = user.open_id || tokens.open_id;
  const { data: taken } = await db.from("vendor_tiktok_connections").select("vendor_id").eq("open_id", openId).neq("vendor_id", vendorId).maybeSingle();
  if (taken) throw new UserError("This TikTok account is already connected to another shop.", 409);

  await saveTokens(db, vendorId, tokens);
  const { error } = await db.from("vendor_tiktok_connections").upsert({
    vendor_id: vendorId, open_id: openId, display_name: user.display_name ?? null,
    avatar_url: typeof user.avatar_url === "string" && user.avatar_url.startsWith("https://") ? user.avatar_url : null,
    connected_at: new Date().toISOString(), needs_reconnect: false, last_error: null,
  });
  if (error) throw error;
  return { connected: true, display_name: user.display_name ?? null };
}

async function actionList(db: ReturnType<typeof admin>, vendorId: string, body: Record<string, unknown>) {
  const cursor = Number.isFinite(Number(body.cursor)) ? Number(body.cursor) : undefined;
  const data = await ttForVendor(db, vendorId, `/v2/video/list/?fields=${VIDEO_FIELDS}`, { method: "POST", body: { max_count: 20, ...(cursor ? { cursor } : {}) } });
  const videos = ((data.videos ?? []) as TTVideo[]).filter((v) => ID.test(String(v.id)));
  const { data: chosen } = videos.length
    ? await db.from("posts").select("tiktok_video_id").eq("vendor_id", vendorId).in("tiktok_video_id", videos.map((v) => v.id))
    : { data: [] as { tiktok_video_id: string }[] };
  const picked = new Set((chosen ?? []).map((r) => r.tiktok_video_id));
  return {
    videos: videos.map((v) => ({
      id: v.id, title: (v.title || v.video_description || "").slice(0, 200), duration: v.duration ?? null,
      cover_image_url: typeof v.cover_image_url === "string" && v.cover_image_url.startsWith("https://") ? v.cover_image_url : null,
      share_url: v.share_url ?? null, create_time: v.create_time ?? null, selected: picked.has(v.id),
    })),
    cursor: data.cursor ?? null, has_more: !!data.has_more,
  };
}

const idsOf = (body: Record<string, unknown>) => {
  const ids = Array.isArray(body.video_ids) ? [...new Set(body.video_ids.map(String))] : [];
  if (!ids.length || ids.length > 20 || ids.some((i) => !ID.test(i))) throw new UserError("Choose between 1 and 20 videos.");
  return ids;
};

async function actionSelect(db: ReturnType<typeof admin>, vendorId: string, body: Record<string, unknown>) {
  const ids = idsOf(body);
  const { count } = await db.from("posts").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId).eq("media_type", "tiktok");
  const { data: existing } = await db.from("posts").select("tiktok_video_id").eq("vendor_id", vendorId).in("tiktok_video_id", ids);
  const fresh = ids.length - (existing?.length ?? 0);
  if ((count ?? 0) + fresh > MAX_SELECTED) throw new UserError(`You can show up to ${MAX_SELECTED} TikTok videos. Remove some first.`);

  // video/query only returns videos of the account this vendor authorised, which is what proves the videos are theirs.
  const found = await queryVideos(db, vendorId, ids);
  const rows = await Promise.all(found.filter((v) => ids.includes(v.id)).map(async (v) => ({
    vendor_id: vendorId, media_type: "tiktok", video_url: null, is_active: true, processing_status: "ready",
    created_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : new Date().toISOString(),
    ...postFields(v),
    thumbnail_url: await permanentCover(vendorId, v),
  })));
  if (!rows.length) throw new UserError("Those videos were not found on your TikTok account.", 404);
  const { error } = await db.from("posts").upsert(rows, { onConflict: "vendor_id,tiktok_video_id" });
  if (error) throw error;
  await forgetExclusions(db, vendorId, rows.map((r) => r.tiktok_video_id)); // chosen on purpose again
  return { selected: rows.map((r) => r.tiktok_video_id) };
}

async function actionUnselect(db: ReturnType<typeof admin>, vendorId: string, body: Record<string, unknown>) {
  const ids = idsOf(body);
  const { error } = await db.from("posts").delete().eq("vendor_id", vendorId).eq("media_type", "tiktok").in("tiktok_video_id", ids);
  if (error) throw error;
  return { removed: ids };
}

async function forgetExclusions(db: ReturnType<typeof admin>, vendorId: string, ids: string[]) {
  const { data: c } = await db.from("vendor_tiktok_connections").select("excluded_video_ids").eq("vendor_id", vendorId).maybeSingle();
  const cur = (c?.excluded_video_ids ?? []) as string[];
  if (cur.some((i) => ids.includes(i))) {
    await db.from("vendor_tiktok_connections").update({ excluded_video_ids: cur.filter((i) => !ids.includes(i)) }).eq("vendor_id", vendorId);
  }
}

/** Auto mode: add the newest videos that are not shown yet and were not removed by the seller. Returns how many were added. */
async function importNew(db: ReturnType<typeof admin>, vendorId: string): Promise<number> {
  const { data: conn } = await db.from("vendor_tiktok_connections").select("excluded_video_ids").eq("vendor_id", vendorId).maybeSingle();
  const excluded = new Set((conn?.excluded_video_ids ?? []) as string[]);
  const { count } = await db.from("posts").select("id", { count: "exact", head: true }).eq("vendor_id", vendorId).eq("media_type", "tiktok");
  const room = MAX_SELECTED - (count ?? 0);
  if (room <= 0) return 0;

  const data = await ttForVendor(db, vendorId, `/v2/video/list/?fields=${VIDEO_FIELDS}`, { method: "POST", body: { max_count: 20 } });
  const latest = ((data.videos ?? []) as TTVideo[]).filter((v) => ID.test(String(v.id)) && !excluded.has(v.id));
  if (!latest.length) return 0;
  const { data: have } = await db.from("posts").select("tiktok_video_id").eq("vendor_id", vendorId).in("tiktok_video_id", latest.map((v) => v.id));
  const haveIds = new Set((have ?? []).map((r) => r.tiktok_video_id));
  const fresh = latest.filter((v) => !haveIds.has(v.id)).slice(0, Math.min(AUTO_BATCH, room));
  if (!fresh.length) return 0;

  const rows = await Promise.all(fresh.map(async (v) => ({
    vendor_id: vendorId, media_type: "tiktok", video_url: null, is_active: true, processing_status: "ready",
    created_at: v.create_time ? new Date(v.create_time * 1000).toISOString() : new Date().toISOString(),
    ...postFields(v),
    thumbnail_url: await permanentCover(vendorId, v),
  })));
  const { error } = await db.from("posts").upsert(rows, { onConflict: "vendor_id,tiktok_video_id", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

async function actionSetAuto(db: ReturnType<typeof admin>, vendorId: string, body: Record<string, unknown>) {
  const enabled = body.enabled === true;
  const { error } = await db.from("vendor_tiktok_connections").update({ auto_import: enabled }).eq("vendor_id", vendorId);
  if (error) throw error;
  const result = enabled ? await syncVendor(db, vendorId) : { updated: 0, removed: 0, added: 0 };
  return { auto_import: enabled, ...result };
}

async function syncVendor(db: ReturnType<typeof admin>, vendorId: string) {
  const { data: posts } = await db.from("posts").select("id, tiktok_video_id, thumbnail_url").eq("vendor_id", vendorId).eq("media_type", "tiktok");
  const ids = (posts ?? []).map((p) => p.tiktok_video_id as string).filter(Boolean);
  let updated = 0, removed = 0;
  if (ids.length) {
    // If TikTok cannot be reached this throws BEFORE anything is changed, so a hiccup never deletes posts.
    const found = new Map((await queryVideos(db, vendorId, ids)).map((v) => [v.id, v]));
    for (const p of posts ?? []) {
      const v = found.get(p.tiktok_video_id as string);
      if (v) {
        const { tiktok_video_id: _a, tiktok_embed_url: _b, ...fields } = postFields(v);
        fields.thumbnail_url = await permanentCover(vendorId, v, p.thumbnail_url as string | null);
        await db.from("posts").update(fields).eq("id", p.id); updated++;
      } else {
        await db.from("posts").delete().eq("id", p.id); removed++; // deleted or made private on TikTok
      }
    }
  }
  const { data: conn } = await db.from("vendor_tiktok_connections").select("auto_import").eq("vendor_id", vendorId).maybeSingle();
  const added = conn?.auto_import ? await importNew(db, vendorId) : 0;
  await db.from("vendor_tiktok_connections").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("vendor_id", vendorId);
  return { updated, removed, added };
}

async function actionDisconnect(db: ReturnType<typeof admin>, vendorId: string) {
  const { data: row } = await db.from("vendor_tiktok_tokens").select("access_token").eq("vendor_id", vendorId).maybeSingle();
  if (row) { // best effort: even if TikTok is unreachable we still remove everything on our side
    try {
      const { key, secret } = cfg();
      await fetch(`${TT}/v2/oauth/revoke/`, {
        method: "POST", signal: AbortSignal.timeout(10_000),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: key, client_secret: secret, token: row.access_token }),
      });
    } catch { /* ignore */ }
  }
  await db.from("posts").delete().eq("vendor_id", vendorId).eq("media_type", "tiktok");
  await db.from("vendor_tiktok_tokens").delete().eq("vendor_id", vendorId);
  await db.from("vendor_tiktok_connections").delete().eq("vendor_id", vendorId);
  return { disconnected: true };
}

/** The admin switch (Admin > Marketplace > Sections and rules). Everything except disconnect needs it on. */
async function tiktokEnabled(db: ReturnType<typeof admin>): Promise<boolean> {
  const { data } = await db.from("marketplace_settings").select("tiktok_enabled").eq("id", true).maybeSingle();
  return data?.tiktok_enabled === true;
}

async function actionSyncAll(db: ReturnType<typeof admin>) {
  if (!(await tiktokEnabled(db))) return { skipped: "TikTok is switched off" };
  const { data: conns } = await db.from("vendor_tiktok_connections").select("vendor_id").eq("needs_reconnect", false).order("last_synced_at", { ascending: true, nullsFirst: true }).limit(500);
  let ok = 0, failed = 0;
  for (const c of conns ?? []) {
    try { await syncVendor(db, c.vendor_id); ok++; } catch { failed++; }
  }
  return { vendors: (conns ?? []).length, ok, failed };
}

// ---- entry point -----------------------------------------------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (req.method !== "POST") throw new UserError("Method not allowed", 405);
    const db = admin();
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* no body */ }
    const action = String(body.action ?? "");

    if (action === "sync_all") { // scheduled job: needs the shared secret, no user
      const secret = Deno.env.get("TIKTOK_CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) throw new UserError("Unauthorized", 401);
      return json(await actionSyncAll(db));
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserError("Unauthorized", 401);
    const { data: { user }, error: userError } = await db.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !user) throw new UserError("Unauthorized", 401);

    if (action === "config_status") { // for the admin switch: only says whether the keys exist, never the keys
      const { data: isAdmin } = await db.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (isAdmin !== true) throw new UserError("Forbidden", 403);
      return json({ configured: !!(Deno.env.get("TIKTOK_CLIENT_KEY") && Deno.env.get("TIKTOK_CLIENT_SECRET") && Deno.env.get("TIKTOK_REDIRECT_URI")) });
    }

    const { data: vendor } = await db.from("vendors").select("id, is_approved").eq("user_id", user.id).maybeSingle();
    if (!vendor || !vendor.is_approved) throw new UserError("Only approved sellers can connect TikTok.", 403);

    if (action !== "disconnect" && !(await tiktokEnabled(db))) throw new UserError("TikTok is not available yet.", 403);

    switch (action) {
      case "start": return json(await actionStart(db, vendor.id));
      case "connect": return json(await actionConnect(db, vendor.id, body));
      case "list": return json(await actionList(db, vendor.id, body));
      case "select": return json(await actionSelect(db, vendor.id, body));
      case "unselect": return json(await actionUnselect(db, vendor.id, body));
      case "sync": return json(await syncVendor(db, vendor.id));
      case "set_auto": return json(await actionSetAuto(db, vendor.id, body));
      case "disconnect": return json(await actionDisconnect(db, vendor.id));
      default: throw new UserError("Unknown action.");
    }
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, e.status);
    console.error("tiktok function error:", e instanceof Error ? e.message : String(e)); // never log tokens
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
