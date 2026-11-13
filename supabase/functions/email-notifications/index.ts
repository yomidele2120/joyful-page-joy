import { createClient } from "npm:@supabase/supabase-js@2";
import { renderNotificationEmail, type NotificationEmailData } from "../_shared/emailTemplates.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-email-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

type Job = {
  id: string;
  event_key: string;
  event_type: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

type OrderRow = {
  id: string;
  total: number;
  email: string | null;
  status: string;
  payment_method: string | null;
  shipping_city?: string | null;
  shipping_state?: string | null;
};
type OrderItemRow = {
  quantity: number;
  price: number;
  products: { name?: string; slug?: string; vendor_id?: string | null } | null;
};

const adminDb = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function equalSecret(actual: string, expected: string): boolean {
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function text(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function numeric(value: unknown): number | undefined {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? undefined : number;
}

async function recipientFor(db: ReturnType<typeof adminDb>, job: Job): Promise<string | null> {
  if (job.recipient_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(job.recipient_email)) return job.recipient_email;
  if (!job.recipient_user_id) return null;
  const { data, error } = await db.auth.admin.getUserById(job.recipient_user_id);
  if (error) throw error;
  const email = data.user?.email;
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

async function enrich(db: ReturnType<typeof adminDb>, job: Job): Promise<NotificationEmailData> {
  const data: NotificationEmailData = {};
  const payload = job.payload ?? {};
  const orderId = text(payload.order_id);
  if (orderId && job.event_type.startsWith("buyer.order_") || orderId && job.event_type.startsWith("vendor.order_")) {
    const { data: order, error } = await db.from("orders")
      .select("id,total,email,status,payment_method,shipping_city,shipping_state")
      .eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (order) {
      const row = order as OrderRow;
      data.orderNumber = row.id.slice(0, 8).toUpperCase();
      data.currency = "NGN";
      data.paymentMethod = row.payment_method ?? undefined;
      data.paymentReference = text(payload.payment_reference);
      const vendorId = text(payload.vendor_id);
      let itemsQuery = db.from("order_items").select("quantity,price,products!inner(name,slug,vendor_id)").eq("order_id", orderId);
      if (vendorId) itemsQuery = itemsQuery.eq("products.vendor_id", vendorId);
      const { data: items, error: itemsError } = await itemsQuery;
      if (itemsError) throw itemsError;
      data.items = ((items ?? []) as OrderItemRow[]).map(item => ({
        name: item.products?.name ?? "Marketplace product",
        quantity: Number(item.quantity),
        unitPrice: Number(item.price),
        href: item.products?.slug ? `${Deno.env.get("SITE_URL") ?? "https://www.ithubafrica.com"}/product/${encodeURIComponent(item.products.slug)}` : undefined,
      }));
      data.total = vendorId
        ? data.items.reduce((sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.quantity ?? 0), 0)
        : Number(row.total);
      if (vendorId) {
        const { data: vendor, error: vendorError } = await db.from("vendors").select("store_name").eq("id", vendorId).maybeSingle();
        if (vendorError) throw vendorError;
        data.storeName = vendor?.store_name ?? undefined;
      }
    }
  } else if (job.event_type.includes("inquiry")) {
    const inquiryId = text(payload.inquiry_id);
    if (inquiryId) {
      const { data: inquiry, error } = await db.from("inquiries")
        .select("buyer_id,vendor_id,message,quantity,products(name,slug),vendors(user_id,store_name)").eq("id", inquiryId).maybeSingle();
      if (error) throw error;
      if (inquiry) {
        data.quantity = Number(inquiry.quantity);
        data.productName = (inquiry.products as { name?: string } | null)?.name;
        data.storeName = (inquiry.vendors as { store_name?: string } | null)?.store_name;
        if (job.event_type === "vendor.new_inquiry") data.message = inquiry.message;
        if (job.event_type === "buyer.inquiry_replied") {
          const vendorUserId = (inquiry.vendors as { user_id?: string } | null)?.user_id;
          const { data: conversation, error: conversationError } = await db.from("conversations")
            .select("id").or(`and(participant_1.eq.${inquiry.buyer_id},participant_2.eq.${vendorUserId}),and(participant_1.eq.${vendorUserId},participant_2.eq.${inquiry.buyer_id})`)
            .maybeSingle();
          if (conversationError) throw conversationError;
          if (conversation && vendorUserId) {
            const { data: reply, error: replyError } = await db.from("messages").select("content")
              .eq("conversation_id", conversation.id).eq("sender_id", vendorUserId).order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (replyError) throw replyError;
            data.message = reply?.content;
          }
        }
      }
    }
  } else if (job.event_type === "buyer.rfq_quote") {
    const quoteId = text(payload.quote_id);
    if (quoteId) {
      const { data: quote, error } = await db.from("rfq_quotes")
        .select("unit_price,moq,lead_time,message,vendors(store_name),rfqs(title,quantity,unit)").eq("id", quoteId).maybeSingle();
      if (error) throw error;
      if (quote) {
        const rfq = quote.rfqs as { title?: string; quantity?: number; unit?: string } | null;
        const vendor = quote.vendors as { store_name?: string } | null;
        data.title = rfq?.title;
        data.quantity = quote.moq ?? undefined;
        data.unit = rfq?.unit;
        data.unitPrice = Number(quote.unit_price);
        data.message = quote.message ?? quote.lead_time ?? undefined;
        data.storeName = vendor?.store_name;
      }
    }
  } else if (job.event_type === "vendor.new_rfq") {
    const rfqId = text(payload.rfq_id);
    if (rfqId) {
      const { data: rfq, error } = await db.from("rfqs").select("title,description,quantity,unit,destination,target_price").eq("id", rfqId).maybeSingle();
      if (error) throw error;
      if (rfq) Object.assign(data, {
        title: rfq.title, description: rfq.description, quantity: rfq.quantity,
        unit: rfq.unit, destination: rfq.destination, targetPrice: rfq.target_price,
      });
    }
    const vendorId = text(payload.vendor_id);
    if (vendorId) {
      const { data: vendor, error } = await db.from("vendors").select("store_name").eq("id", vendorId).maybeSingle();
      if (error) throw error;
      data.storeName = vendor?.store_name;
    }
  } else if (job.event_type.includes("refund")) {
    const refundId = text(payload.refund_id);
    if (refundId) {
      const { data: refund, error } = await db.from("refunds").select("amount,reason,status,order_id").eq("id", refundId).maybeSingle();
      if (error) throw error;
      if (refund) {
        data.amount = Number(refund.amount);
        data.reason = refund.reason;
        data.orderNumber = refund.order_id.slice(0, 8).toUpperCase();
      }
    }
  } else if (job.event_type.includes("membership")) {
    data.statusLabel = text(payload.plan_slug)?.toUpperCase() ?? "supplier";
    data.expiresAt = text(payload.expires_at);
    data.daysLeft = numeric(payload.days_left);
    data.paymentReference = text(payload.payment_reference);
  } else if (job.event_type.startsWith("vendor.payout_")) {
    data.amount = numeric(payload.amount);
    data.statusLabel = text(payload.status);
    data.reason = text(payload.reason);
  } else if (job.event_type.includes("dispute")) {
    data.orderNumber = text(payload.order_id)?.slice(0, 8).toUpperCase();
    data.statusLabel = text(payload.status);
  } else if (job.event_type === "admin.payment_alert" || job.event_type === "buyer.payment_issue") {
    const paymentId = text(payload.payment_id);
    if (paymentId) {
      const { data: payment, error } = await db.from("payments").select("order_id,paystack_reference,status,amount,currency").eq("id", paymentId).maybeSingle();
      if (error) throw error;
      if (payment) {
        data.orderNumber = payment.order_id.slice(0, 8).toUpperCase();
        data.paymentReference = payment.paystack_reference ?? undefined;
        data.amount = Number(payment.amount);
        data.currency = payment.currency ?? "NGN";
        data.statusLabel = payment.status;
      }
    }
  } else if (job.event_type === "admin.new_vendor") {
    data.storeName = text(payload.store_name);
  } else if (job.event_type === "admin.content_report") {
    data.reason = text(payload.reason);
  } else if (job.event_type === "user.support_reply") {
    const ticketId = text(payload.ticket_id);
    if (ticketId) {
      const { data: ticket, error } = await db.from("support_tickets").select("subject,admin_reply").eq("id", ticketId).maybeSingle();
      if (error) throw error;
      data.title = ticket?.subject;
      data.message = ticket?.admin_reply ?? undefined;
    }
  } else if (job.event_type === "admin.dispute_opened") {
    data.orderNumber = text(payload.order_id)?.slice(0, 8).toUpperCase();
  }
  return data;
}

async function deliver(db: ReturnType<typeof adminDb>, job: Job, apiKey: string, from: string, siteUrl: string) {
  try {
    const recipient = await recipientFor(db, job);
    if (!recipient) {
      await db.rpc("fail_email_notification_job", { _id: job.id, _error: "Recipient email is missing or invalid", _permanent: true });
      return { id: job.id, status: "failed" };
    }
    const data = await enrich(db, job);
    const template = renderNotificationEmail(job.event_type, data, siteUrl);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(12_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": job.event_key.slice(0, 256),
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject: template.subject,
        html: template.html,
        text: template.text,
        tags: [
          { name: "event_type", value: job.event_type.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 256) },
          { name: "job_id", value: job.id },
        ],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
      const message = String(result?.message ?? result?.error ?? `Resend returned ${response.status}`);
      await db.rpc("fail_email_notification_job", { _id: job.id, _error: message, _permanent: permanent });
      return { id: job.id, status: permanent ? "failed" : "retrying" };
    }
    const { error } = await db.rpc("complete_email_notification_job", {
      _id: job.id, _recipient_email: recipient, _resend_id: typeof result?.id === "string" ? result.id : null,
    });
    if (error) throw error;
    return { id: job.id, status: "sent" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    await db.rpc("fail_email_notification_job", { _id: job.id, _error: message, _permanent: false });
    return { id: job.id, status: "retrying" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const expectedSecret = Deno.env.get("EMAIL_WORKER_SECRET");
  const providedSecret = req.headers.get("x-email-worker-secret") ?? "";
  if (!expectedSecret || !equalSecret(providedSecret, expectedSecret)) return json({ error: "Unauthorized" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  const siteUrl = (Deno.env.get("SITE_URL") ?? "https://www.ithubafrica.com").replace(/\/$/, "");
  if (!apiKey || !from) return json({ error: "Email delivery is not configured" }, 503);

  try {
    const db = adminDb();
    await db.rpc("queue_supplier_membership_expiry_emails");
    const { data: jobs, error } = await db.rpc("claim_email_notification_jobs", { _limit: 20 });
    if (error) throw error;
    const results: { id: string; status: string }[] = [];
    for (let i = 0; i < (jobs ?? []).length; i += 5) {
      const batch = (jobs as Job[]).slice(i, i + 5);
      results.push(...await Promise.all(batch.map(job => deliver(db, job, apiKey, from, siteUrl))));
    }
    return json({ claimed: jobs?.length ?? 0, sent: results.filter(result => result.status === "sent").length,
      retrying: results.filter(result => result.status === "retrying").length,
      failed: results.filter(result => result.status === "failed").length });
  } catch (error) {
    console.error("email-notifications worker failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not process email notifications" }, 500);
  }
});
