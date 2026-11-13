import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyResendWebhook } from "../_shared/resendWebhook.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return json({ error: "Webhook is not configured" }, 503);

  let event;
  try {
    const rawBody = await req.text();
    event = await verifyResendWebhook(rawBody, {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    }, secret);
  } catch (error) {
    console.warn("Rejected Resend webhook", error instanceof Error ? error.message : String(error));
    return json({ error: "Invalid webhook signature or payload" }, 400);
  }

  const serviceUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceUrl || !serviceKey) return json({ error: "Webhook storage is not configured" }, 503);

  const db = createClient(serviceUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const emailId = typeof event.data.email_id === "string" ? event.data.email_id : null;
  const jobId = typeof event.data.tags?.job_id === "string" ? event.data.tags.job_id : null;
  const { data: result, error } = await db.rpc("apply_resend_email_event", {
    _provider_event_id: req.headers.get("svix-id"),
    _event_type: event.type,
    _resend_id: emailId,
    _job_id: jobId,
    _payload: event as unknown as Record<string, unknown>,
  });
  if (error) {
    console.error("Could not record Resend webhook", error.message);
    return json({ error: "Could not record email event" }, 500);
  }
  return json({ received: true, result });
});
