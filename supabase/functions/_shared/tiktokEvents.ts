// TikTok Events API (v1.3) helpers. Pure functions: no network, no secrets, easy to test.
// Docs: https://business-api.tiktok.com/portal/docs?id=1771101027431425
export const TIKTOK_EVENTS_URL = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

export interface OrderForEvent {
  id: string; total: number; email: string | null;
  items: { product_id: string; name: string | null; quantity: number; price: number }[];
}
export interface AttributionForEvent {
  ttclid: string | null; ttp: string | null; user_agent: string | null; page_url: string | null;
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Builds one Events API request body. Only a hashed email and TikTok's own click ids identify the buyer.
 *  Card details, names, phone numbers and addresses are never included. */
export async function buildEventRequest(opts: {
  pixelCode: string; eventName: "CompletePayment" | "SubmitForm"; eventId: string;
  order: OrderForEvent; attribution: AttributionForEvent; eventTime?: number; testEventCode?: string;
}) {
  const { order, attribution } = opts;
  const user: Record<string, string> = {};
  if (order.email) user.email = await sha256Hex(order.email);
  if (attribution.ttclid) user.ttclid = attribution.ttclid;
  if (attribution.ttp) user.ttp = attribution.ttp;
  if (attribution.user_agent) user.user_agent = attribution.user_agent;
  const body: Record<string, unknown> = {
    event_source: "web",
    event_source_id: opts.pixelCode,
    data: [{
      event: opts.eventName,
      event_time: opts.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: opts.eventId,
      user,
      page: attribution.page_url ? { url: attribution.page_url } : undefined,
      properties: {
        currency: "NGN",
        value: Number(order.total),
        content_type: "product",
        order_id: order.id,
        contents: order.items.map((i) => ({
          content_id: i.product_id, content_name: i.name ?? undefined, content_type: "product",
          quantity: i.quantity, price: Number(i.price),
        })),
      },
    }],
  };
  if (opts.testEventCode) body.test_event_code = opts.testEventCode;
  return body;
}

/** TikTok answers HTTP 200 with { code: 0 } on success; anything else is a failure with a message. */
export function readResponse(httpStatus: number, json: any): { ok: boolean; detail: string } {
  if (httpStatus === 200 && json && Number(json.code) === 0) return { ok: true, detail: "sent" };
  const msg = String(json?.message ?? `HTTP ${httpStatus}`).slice(0, 300);
  return { ok: false, detail: `TikTok code ${json?.code ?? "?"}: ${msg}` };
}
