// Sends queued purchases (meta_event_log) to Meta's Conversions API.
// Who may call it: the server (service-role key) or a signed-in admin.
// Secrets (Supabase, never in code): META_CONVERSIONS_ACCESS_TOKEN (required), META_PIXEL_ID (optional), META_TEST_EVENT_CODE (optional).
// Queued by the database only after a payment is confirmed; sent only if the buyer allowed marketing cookies.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildMetaRequest, metaEventsUrl, readMetaResponse } from "../_shared/metaEvents.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let allowed = token === serviceKey;
  if (!allowed && token) {
    const { data: u } = await db.auth.getUser(token);
    if (u?.user) { const { data: isAdmin } = await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" }); allowed = !!isAdmin; }
  }
  if (!allowed) return reply({ error: "Not allowed" }, 401);

  const accessToken = Deno.env.get("META_CONVERSIONS_ACCESS_TOKEN");
  if (!accessToken) return reply({ ok: false, error: "META_CONVERSIONS_ACCESS_TOKEN is not set" });
  const pixelId = Deno.env.get("META_PIXEL_ID") || "2364055121096809";
  const testEventCode = Deno.env.get("META_TEST_EVENT_CODE") || undefined;

  const { data: rows, error } = await db.from("meta_event_log").select("id, order_id, event_name, event_id, attempts")
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`).order("created_at").limit(25);
  if (error) return reply({ ok: false, error: error.message }, 500);

  const summary = { sent: 0, failed: 0, skipped: 0 };
  for (const row of rows ?? []) {
    const finish = (patch: Record<string, unknown>) => db.from("meta_event_log").update(patch).eq("id", row.id);
    try {
      const [{ data: order }, { data: attribution }] = await Promise.all([
        db.from("orders").select("id, status, total, email, order_items(product_id, quantity, price, products(name))").eq("id", row.order_id).maybeSingle(),
        db.from("order_attribution").select("marketing_consent, fbp, fbc, user_agent, page_url").eq("order_id", row.order_id).maybeSingle(),
      ]);
      if (!order || !["paid", "processing", "shipped", "delivered"].includes(order.status)) {
        await finish({ status: "skipped", detail: "order is not in a paid state" }); summary.skipped++; continue;
      }
      if (!attribution?.marketing_consent) {
        await finish({ status: "skipped", detail: "buyer did not allow marketing cookies (or no record)" }); summary.skipped++; continue;
      }
      const body = await buildMetaRequest({
        eventId: row.event_id, testEventCode,
        order: { id: order.id, total: Number(order.total), email: order.email,
          items: (order.order_items ?? []).map((i: any) => ({ product_id: i.product_id, name: i.products?.name ?? null, quantity: i.quantity, price: i.price })) },
        attribution: { ttclid: null, ttp: null, ...attribution },
      });
      const res = await fetch(metaEventsUrl(pixelId), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },   // header, so the token never appears in a URL
        body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => null);
      const result = readMetaResponse(res.status, json);
      if (result.ok) { await finish({ status: "sent", attempts: row.attempts + 1, http_status: res.status, detail: testEventCode ? "sent (test mode)" : "sent", sent_at: new Date().toISOString() }); summary.sent++; }
      else { await finish({ status: "failed", attempts: row.attempts + 1, http_status: res.status, detail: result.detail }); summary.failed++; }
    } catch (e) {
      await finish({ status: "failed", attempts: row.attempts + 1, detail: String((e as Error)?.message ?? e).slice(0, 300) }); summary.failed++;
    }
  }
  return reply({ ok: true, ...summary });
});
