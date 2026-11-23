// Meta Conversions API helpers (pure: no network, no secrets). Reuses the SHA-256 helper from the TikTok module.
import { sha256Hex, type AttributionForEvent, type OrderForEvent } from "./tiktokEvents.ts";

export const META_GRAPH_VERSION = "v21.0";
export const metaEventsUrl = (pixelId: string) => `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixelId)}/events`;

export async function buildMetaRequest(opts: {
  eventId: string; order: OrderForEvent; attribution: AttributionForEvent & { fbp?: string | null; fbc?: string | null };
  eventTime?: number; testEventCode?: string;
}) {
  const { order, attribution: a } = opts;
  const user: Record<string, unknown> = {};
  if (order.email) user.em = [await sha256Hex(order.email)];
  if (a.user_agent) user.client_user_agent = a.user_agent;
  if (a.fbp) user.fbp = a.fbp;
  if (a.fbc) user.fbc = a.fbc;
  const body: Record<string, unknown> = {
    data: [{
      event_name: "Purchase",
      event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: opts.eventId,                 // same id as the browser pixel, so Meta counts the purchase once
      action_source: "website",
      event_source_url: a.page_url ?? undefined,
      user_data: user,
      custom_data: {
        currency: "NGN", value: Number(order.total), order_id: order.id, content_type: "product",
        content_ids: order.items.map((i) => i.product_id),
        contents: order.items.map((i) => ({ id: i.product_id, quantity: i.quantity, item_price: Number(i.price) })),
      },
    }],
  };
  if (opts.testEventCode) body.test_event_code = opts.testEventCode;
  return body;
}

/** Meta answers HTTP 200 with { events_received: n } on success, or { error: { message } }. */
export function readMetaResponse(httpStatus: number, json: any): { ok: boolean; detail: string } {
  if (httpStatus === 200 && Number(json?.events_received) >= 1) return { ok: true, detail: "sent" };
  const msg = String(json?.error?.message ?? `HTTP ${httpStatus}`).slice(0, 300);
  return { ok: false, detail: `Meta: ${msg}` };
}
