// Sends queued conversion events (see tiktok_event_log) to TikTok's Events API.
//
// Who may call it: the server itself (service-role key, used by the payment functions and the schedule) or a signed-in admin.
// Secrets (set in Supabase, never in code):  TIKTOK_EVENTS_ACCESS_TOKEN  (required)
//                                           TIKTOK_PIXEL_CODE            (optional, defaults to the site's pixel)
//                                           TIKTOK_TEST_EVENT_CODE       (optional: events then show only in TikTok's Test Events tab)
// Events are only queued by the database after a payment has been confirmed, and are only sent when the buyer
// allowed marketing cookies. Each event uses the order id as its id, so TikTok merges it with the browser copy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildEventRequest, readResponse, TIKTOK_EVENTS_URL } from "../_shared/tiktokEvents.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey);

  // --- who is calling
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  let allowed = token === serviceKey;
  if (!allowed && token) {
    const { data: u } = await db.auth.getUser(token);
    if (u?.user) {
      const { data: isAdmin } = await db.rpc("has_role", { _user_id: u.user.id, _role: "admin" });
      allowed = !!isAdmin;
    }
  }
  if (!allowed) return reply({ error: "Not allowed" }, 401);

  const accessToken = Deno.env.get("TIKTOK_EVENTS_ACCESS_TOKEN");
  if (!accessToken) return reply({ ok: false, error: "TIKTOK_EVENTS_ACCESS_TOKEN is not set" });
  const pixelCode = Deno.env.get("TIKTOK_PIXEL_CODE") || "DC2254JC77U6OQMIEJHG";
  const testEventCode = Deno.env.get("TIKTOK_TEST_EVENT_CODE") || undefined;

  const { data: rows, error } = await db.from("tiktok_event_log")
    .select("id, order_id, event_name, event_id, attempts, status")
    .or(`status.eq.pending,and(status.eq.failed,attempts.lt.${MAX_ATTEMPTS})`)
    .order("created_at").limit(25);
  if (error) return reply({ ok: false, error: error.message }, 500);

  const summary = { sent: 0, failed: 0, skipped: 0 };
  for (const row of rows ?? []) {
    const finish = (patch: Record<string, unknown>) => db.from("tiktok_event_log").update(patch).eq("id", row.id);
    try {
      const [{ data: order }, { data: attribution }] = await Promise.all([
        db.from("orders").select("id, status, total, email, order_items(product_id, quantity, price, products(name))").eq("id", row.order_id).maybeSingle(),
        db.from("order_attribution").select("marketing_consent, ttclid, ttp, user_agent, page_url").eq("order_id", row.order_id).maybeSingle(),
      ]);
      // Re-check before sending: only an order that is still paid counts.
      if (!order || !["paid", "processing", "shipped", "delivered"].includes(order.status)) {
        await finish({ status: "skipped", detail: "order is not in a paid state" }); summary.skipped++; continue;
      }
      if (!attribution?.marketing_consent) {
        await finish({ status: "skipped", detail: "buyer did not allow marketing cookies (or no record)" }); summary.skipped++; continue;
      }
      const body = await buildEventRequest({
        pixelCode, eventName: row.event_name, eventId: row.event_id, testEventCode,
        order: {
          id: order.id, total: Number(order.total), email: order.email,
          items: (order.order_items ?? []).map((i: any) => ({ product_id: i.product_id, name: i.products?.name ?? null, quantity: i.quantity, price: i.price })),
        },
        attribution,
      });
      const res = await fetch(TIKTOK_EVENTS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Access-Token": accessToken },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json = await res.json().catch(() => null);
      const result = readResponse(res.status, json);
      if (result.ok) {
        await finish({ status: "sent", attempts: row.attempts + 1, http_status: res.status, detail: testEventCode ? "sent (test mode)" : "sent", sent_at: new Date().toISOString() });
        summary.sent++;
      } else {
        await finish({ status: "failed", attempts: row.attempts + 1, http_status: res.status, detail: result.detail });
        summary.failed++;
      }
    } catch (e) {
      await finish({ status: "failed", attempts: row.attempts + 1, detail: String((e as Error)?.message ?? e).slice(0, 300) });
      summary.failed++;
    }
  }
  return reply({ ok: true, ...summary });
});
