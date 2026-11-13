import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const merchantApi = "https://merchantapi.googleapis.com";
const productColumns = [
  "id", "name", "slug", "description", "price", "image_url", "images", "brand", "specs",
  "stock_quantity", "is_preorder", "preorder_approved", "preorder_status", "preorder_release_date",
  "vendor_id", "is_public", "is_active", "category_id", "categories(name)",
  "vendors!inner(store_name,is_approved)",
].join(",");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const admin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function validCloudinaryImage(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && url.hostname === "res.cloudinary.com" && !!url.pathname.split("/")[1];
  } catch {
    return false;
  }
}

function publicImage(product: Record<string, unknown>): string | null {
  if (validCloudinaryImage(product.image_url)) return product.image_url.trim();
  if (Array.isArray(product.images)) {
    const image = product.images.find(validCloudinaryImage);
    if (typeof image === "string") return image.trim();
  }
  return null;
}

function normalizeCondition(value: unknown): string | null {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "new") return "NEW";
  if (raw === "used") return "USED";
  if (raw === "refurbished") return "REFURBISHED";
  return null;
}

function googleAvailability(product: Record<string, unknown>): string {
  const preorder = Boolean(product.is_preorder)
    && Boolean(product.preorder_approved)
    && String(product.preorder_status ?? "").toLowerCase() === "open";
  if (preorder) return "PREORDER";
  return Number(product.stock_quantity ?? 0) > 0 ? "IN_STOCK" : "OUT_OF_STOCK";
}

function hasApprovedVendor(product: Record<string, unknown>): boolean {
  const vendor = Array.isArray(product.vendors) ? product.vendors[0] : product.vendors;
  return Boolean(objectValue(vendor).is_approved);
}

function isEligible(product: Record<string, unknown>): boolean {
  return Boolean(product.is_public)
    && product.is_active !== false
    && hasApprovedVendor(product)
    && Number(product.price) > 0
    && !!normalizeText(product.name)
    && !!normalizeText(product.description)
    && !!publicImage(product);
}

let accessToken: string | null = null;
let tokenExpiresAt = 0;

async function getGoogleAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;

  const clientId = Deno.env.get("GOOGLE_MERCHANT_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_MERCHANT_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_MERCHANT_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new UserError("Google Merchant Center credentials are not configured on the server.", 501);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new UserError(data?.error_description || data?.error || "Google Merchant Center authentication failed.", 502);
  }

  accessToken = String(data.access_token);
  tokenExpiresAt = Date.now() + Number(data.expires_in ?? 3600) * 1000;
  return accessToken;
}

async function googleRequest<T>(path: string, method = "GET", body?: Record<string, unknown>): Promise<T> {
  const token = await getGoogleAccessToken();
  const response = await fetch(`${merchantApi}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new UserError(`Google Merchant API returned invalid JSON (${response.status}).`, 502);
    }
  }
  if (!response.ok) {
    const error = objectValue(data.error);
    const googleMessage = String(error.message ?? error.status ?? `HTTP ${response.status}`);
    const reasons = Array.isArray(error.details)
      ? error.details.map((detail) => normalizeText(objectValue(detail).message)).filter(Boolean).join("; ")
      : "";
    throw new UserError(`Google Merchant API ${response.status}: ${googleMessage}${reasons ? ` — ${reasons}` : ""}`, response.status >= 500 ? 502 : 400);
  }
  return data as T;
}

async function saveLog(
  db: ReturnType<typeof admin>,
  action: string,
  status: string,
  message: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await db.from("google_merchant_sync_logs").insert({ action, status, message, details });
  if (error) throw error;
}

async function getMerchantSettings(db: ReturnType<typeof admin>) {
  const { data, error } = await db.from("google_merchant_settings").select("*").eq("id", true).maybeSingle();
  if (error) throw error;
  return data ?? {
    id: true,
    merchant_id: null,
    data_source_id: null,
    account_email: null,
    website_url: null,
    target_country: "NG",
    language: "en",
    auto_sync: true,
    is_connected: false,
    last_synced_at: null,
    last_error: null,
  };
}

function validateMerchantSettings(settings: Record<string, unknown>) {
  const merchantId = String(settings.merchant_id ?? "").trim();
  const dataSourceId = String(settings.data_source_id ?? "").trim();
  if (!/^\d+$/.test(merchantId)) {
    throw new UserError("Configure the existing numeric Merchant Center account ID first.", 409);
  }
  if (!/^\d+$/.test(dataSourceId)) {
    throw new UserError("Configure the existing Merchant API data source ID. No data source will be created automatically.", 409);
  }
  return { merchantId, dataSourceId };
}

function priceMicros(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw new UserError("Product price must be greater than zero.", 422);
  const [whole, fraction = "00"] = amount.toFixed(2).split(".");
  return (BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(2, "0")) * 10_000n).toString();
}

function productInput(
  product: Record<string, unknown>,
  settings: Record<string, unknown>,
  merchantId: string,
) {
  const title = normalizeText(product.name).slice(0, 150);
  const description = normalizeText(product.description).slice(0, 5000);
  const imageLink = publicImage(product);
  const websiteUrl = String(settings.website_url ?? "https://www.ithubafrica.com").replace(/\/+$/, "");
  const language = String(settings.language ?? "en").trim().toLowerCase();
  const feedLabel = String(settings.target_country ?? "NG").trim().toUpperCase();
  const slug = normalizeText(product.slug);

  if (!title || !description || !slug || !imageLink) {
    throw new UserError("Product requires a title, description, slug, and publicly hosted Cloudinary image.", 422);
  }
  let website: URL;
  try {
    website = new URL(websiteUrl);
  } catch {
    throw new UserError("The configured product website URL is invalid.", 422);
  }
  if (website.protocol !== "https:") throw new UserError("The configured product website URL must use HTTPS.", 422);

  const specs = objectValue(product.specs);
  const attributes: Record<string, unknown> = {
    title,
    description,
    link: `${websiteUrl}/product/${encodeURIComponent(slug)}`,
    imageLink,
    availability: googleAvailability(product),
    price: { amountMicros: priceMicros(product.price), currencyCode: "NGN" },
  };

  const brand = normalizeText(product.brand);
  if (brand) attributes.brand = brand;

  const condition = normalizeCondition(specs.condition);
  if (condition) attributes.condition = condition;

  const category = normalizeText(objectValue(product.categories).name);
  if (category) attributes.productTypes = [category];

  const gtin = normalizeText(specs.gtin).replace(/[\s_-]/g, "");
  if (/^(\d{8}|\d{12,14})$/.test(gtin)) attributes.gtin = gtin;
  const mpn = normalizeText(specs.mpn);
  if (mpn) attributes.mpn = mpn;
  if (googleAvailability(product) === "PREORDER" && product.preorder_release_date) {
    attributes.availabilityDate = `${String(product.preorder_release_date).slice(0, 10)}T00:00:00Z`;
  }

  return {
    offerId: String(product.id),
    contentLanguage: language,
    feedLabel,
    productAttributes: attributes,
    merchantId,
  };
}

function productHash(input: Record<string, unknown>): Promise<string> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)))
    .then((hash) => [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
}

async function getStoredProduct(db: ReturnType<typeof admin>, productId: string) {
  const { data, error } = await db.from("google_merchant_products")
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function dataSourceName(merchantId: string, dataSourceId: string) {
  return `accounts/${merchantId}/dataSources/${dataSourceId}`;
}

async function insertProductInput(
  input: Record<string, unknown>,
  dataSource: string,
) {
  const merchantId = String(input.merchantId);
  const body = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "merchantId"));
  const path = `/products/v1/accounts/${merchantId}/productInputs:insert?dataSource=${encodeURIComponent(dataSource)}`;
  return await googleRequest<Record<string, unknown>>(path, "POST", body);
}

async function removeGoogleProduct(
  merchantId: string,
  productInputName: string | null,
): Promise<void> {
  if (!productInputName) return;
  const prefix = `accounts/${merchantId}/productInputs/`;
  if (!productInputName.startsWith(prefix)) {
    throw new UserError("Stored Google product input name does not belong to the configured Merchant Center account.", 422);
  }
  await googleRequest<void>(`/products/v1/${productInputName.split("/").map(encodeURIComponent).join("/")}`, "DELETE");
}

async function syncProduct(
  db: ReturnType<typeof admin>,
  productId: string,
  deletionName?: string | null,
): Promise<{ synced: boolean; skipped?: boolean; status: string; message: string }> {
  const settings = await getMerchantSettings(db);
  const { merchantId, dataSourceId } = validateMerchantSettings(settings);
  const dataSource = dataSourceName(merchantId, dataSourceId);
  const { data: product, error } = await db.from("products")
    .select(productColumns)
    .eq("id", productId)
    .maybeSingle();
  if (error) throw error;

  const stored = await getStoredProduct(db, productId);
  if (!product || !isEligible(product as Record<string, unknown>)) {
    const name = deletionName ?? stored?.product_input_name ?? null;
    await removeGoogleProduct(merchantId, name);
    if (product && stored) {
      const { error: updateError } = await db.from("google_merchant_products").update({
        status: "removed",
        approval_status: "not_submitted",
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("product_id", productId);
      if (updateError) throw updateError;
    }
    return { synced: true, status: "removed", message: "Product is not eligible and its Merchant listing was removed." };
  }

  const input = productInput(product as Record<string, unknown>, settings, merchantId);
  const hash = await productHash({ ...input, dataSource });
  if (stored?.sync_hash === hash && stored.status === "submitted") {
    return { synced: true, skipped: true, status: "submitted", message: "Product is unchanged; no duplicate submission was made." };
  }

  const response = await insertProductInput(input, dataSource);
  const resourceName = typeof response.name === "string" ? response.name : stored?.product_input_name ?? null;
  const outputProduct = response.product;
  const productStatus = objectValue(objectValue(outputProduct).productStatus ?? response.productStatus);
  const rawApprovalStatus = normalizeText(productStatus.approvalStatus ?? productStatus.status).toLowerCase();
  const approvalStatus = ["approved", "rejected", "disapproved"].includes(rawApprovalStatus)
    ? rawApprovalStatus
    : "pending";
  const rejectionReasons = Array.isArray(productStatus.rejectionReasons)
    ? productStatus.rejectionReasons
    : Array.isArray(productStatus.itemLevelIssues)
      ? productStatus.itemLevelIssues
      : [];
  const googleProductName = typeof outputProduct === "string"
    ? outputProduct
    : typeof objectValue(outputProduct).name === "string"
      ? String(objectValue(outputProduct).name)
      : stored?.google_product_name ?? null;
  const productRow = product as Record<string, unknown>;
  const { error: saveError } = await db.from("google_merchant_products").upsert({
    product_id: productId,
    merchant_product_id: resourceName,
    product_input_name: resourceName,
    google_product_name: googleProductName,
    external_product_id: String(productId),
    title: normalizeText(productRow.name),
    status: "submitted",
    approval_status: approvalStatus,
    rejection_reasons: rejectionReasons,
    sync_hash: hash,
    last_sync_at: new Date().toISOString(),
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "product_id" });
  if (saveError) throw saveError;

  await saveLog(db, "sync_product", "success", `Submitted product ${normalizeText(productRow.name)} to Google Merchant Center.`, {
    product_id: productId,
    google_product_name: googleProductName,
    product_input_name: resourceName,
    merchant_id: merchantId,
    data_source_id: dataSourceId,
    note: "Submission accepted by the API; this does not indicate product approval.",
  });
  return { synced: true, status: "submitted", message: `Google accepted the product input for ${normalizeText(productRow.name)}.` };
}

async function setQueueFailure(
  db: ReturnType<typeof admin>,
  job: Record<string, unknown>,
  message: string,
) {
  const attempts = Number(job.attempts ?? 1);
  const terminal = attempts >= 8;
  const delayMinutes = Math.min(60, 2 ** attempts);
  const { error } = await db.from("google_merchant_sync_queue").update({
    locked_at: null,
    available_at: new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    last_error: message,
    updated_at: new Date().toISOString(),
  }).eq("product_id", job.product_id);
  if (error) throw error;

  if (job.operation !== "delete") {
    const { data: product, error: productError } = await db.from("products")
      .select("name")
      .eq("id", job.product_id)
      .maybeSingle();
    if (productError) throw productError;
    if (product) {
      const state = await getStoredProduct(db, String(job.product_id));
      const statePayload = {
        status: "failed",
        approval_status: "unknown",
        last_error: message,
        updated_at: new Date().toISOString(),
      };
      const { error: stateError } = state
        ? await db.from("google_merchant_products").update(statePayload).eq("product_id", job.product_id)
        : await db.from("google_merchant_products").insert({
          product_id: job.product_id,
          title: normalizeText(product.name) || String(job.product_id),
          ...statePayload,
        });
      if (stateError) throw stateError;
    }
  }
  await saveLog(db, "sync_queue", "error", message, {
    product_id: job.product_id,
    operation: job.operation,
    attempts,
    retrying: !terminal,
  });
}

async function queueCount(db: ReturnType<typeof admin>): Promise<number> {
  const { count, error } = await db.from("google_merchant_sync_queue")
    .select("product_id", { count: "exact", head: true })
    .lt("attempts", 8);
  if (error) throw error;
  return count ?? 0;
}

async function syncQueueBatch(db: ReturnType<typeof admin>, isCron: boolean) {
  const settings = await getMerchantSettings(db);
  validateMerchantSettings(settings);
  if (isCron && !settings.auto_sync) {
    return {
      processed: 0,
      synced: 0,
      removed: 0,
      failed: 0,
      skipped: 0,
      remaining: await queueCount(db),
      paused: true,
      failures: [],
    };
  }
  const { data: jobs, error } = await db.rpc("claim_google_merchant_sync_jobs", { batch_limit: 10 });
  if (error) throw error;

  let synced = 0;
  let removed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: Array<{ product_id: string; message: string }> = [];
  for (const job of jobs ?? []) {
    try {
      let result: Awaited<ReturnType<typeof syncProduct>>;
      if (job.operation === "delete") {
        result = await syncProduct(db, String(job.product_id), job.product_input_name ?? null);
      } else {
        result = await syncProduct(db, String(job.product_id));
      }
      const { error: deleteError } = await db.from("google_merchant_sync_queue")
        .delete()
        .eq("product_id", job.product_id);
      if (deleteError) throw deleteError;
      if (result.skipped) skipped += 1;
      else if (result.status === "submitted") synced += 1;
      else removed += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Unknown product synchronization failure.";
      failures.push({ product_id: String(job.product_id), message });
      await setQueueFailure(db, job, message);
    }
  }

  const remaining = await queueCount(db);
  const lastError = failures.length ? `${failures.length} product(s) failed in the latest batch.` : null;
  const { error: settingsError } = await db.from("google_merchant_settings").update({
    last_synced_at: new Date().toISOString(),
    last_error: lastError,
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (settingsError) throw settingsError;

  await saveLog(db, "sync_catalog", failed ? "partial" : "success", `Accepted ${synced} submission(s), removed ${removed} listing(s), skipped ${skipped}, and failed ${failed}; ${remaining} remain queued.`, {
    processed: synced + removed + skipped + failed,
    synced,
    removed,
    failed,
    skipped,
    remaining,
    failures,
  });
  return {
    processed: synced + removed + skipped + failed,
    synced,
    removed,
    failed,
    skipped,
    remaining,
    stalled: (jobs ?? []).length === 0 && remaining > 0,
    failures,
  };
}

async function recordProductFailure(
  db: ReturnType<typeof admin>,
  productId: string,
  message: string,
) {
  const { data: product, error: productError } = await db.from("products")
    .select("name")
    .eq("id", productId)
    .maybeSingle();
  if (productError) throw productError;
  if (product) {
    const stored = await getStoredProduct(db, productId);
    const payload = {
      status: "failed",
      approval_status: "unknown",
      last_error: message,
      updated_at: new Date().toISOString(),
    };
    const { error } = stored
      ? await db.from("google_merchant_products").update(payload).eq("product_id", productId)
      : await db.from("google_merchant_products").insert({
        product_id: productId,
        title: normalizeText(product.name) || productId,
        ...payload,
      });
    if (error) throw error;
  }
  await saveLog(db, "sync_product", "error", message, { product_id: productId });
}

async function catalogStats(db: ReturnType<typeof admin>) {
  const [{ data: totalEligible, error: eligibleError }, { count: submitted, error: submittedError },
    { count: failed, error: failedError }, { count: rejected, error: rejectedError },
    { count: awaiting, error: awaitingError }, remaining] = await Promise.all([
    db.rpc("google_merchant_eligible_product_count"),
    db.from("google_merchant_products").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    db.from("google_merchant_products").select("id", { count: "exact", head: true }).eq("status", "failed"),
    db.from("google_merchant_products").select("id", { count: "exact", head: true })
      .in("approval_status", ["rejected", "disapproved"]),
    db.from("google_merchant_products").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
    queueCount(db),
  ]);
  for (const error of [eligibleError, submittedError, failedError, rejectedError, awaitingError]) {
    if (error) throw error;
  }
  return {
    total_eligible: Number(totalEligible ?? 0),
    submitted_successfully: submitted ?? 0,
    pending_sync: remaining,
    failed_submissions: failed ?? 0,
    awaiting_google_processing: awaiting ?? 0,
    rejected_or_disapproved: rejected ?? 0,
  };
}

async function authenticateAdmin(req: Request, db: ReturnType<typeof admin>) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token || token === authorization) throw new UserError("Admin authentication is required.", 401);

  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) throw new UserError("Admin authentication failed.", 401);

  const { data: role, error: roleError } = await db.from("user_roles")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new UserError("Administrator access is required.", 403);
}

async function verifyMerchantConfiguration(merchantId: string, dataSourceId: string) {
  if (!/^\d+$/.test(merchantId)) throw new UserError("Merchant Center ID must contain only digits.", 400);
  if (!/^\d+$/.test(dataSourceId)) throw new UserError("Enter the ID of an existing Merchant API data source.", 400);
  const path = `/datasources/v1/accounts/${merchantId}/dataSources/${dataSourceId}`;
  return await googleRequest<Record<string, unknown>>(path);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json({}, 204);
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  let db: ReturnType<typeof admin> | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "status");
    db = admin();
    const cronKey = Deno.env.get("GOOGLE_MERCHANT_CRON_SECRET");
    const cronSecret = req.headers.get("x-cron-secret") ?? "";
    const isCron = action === "sync_catalog" && !!cronKey && cronSecret === cronKey;
    if (action === "sync_catalog" && cronSecret && cronSecret !== cronKey) {
      throw new UserError("The cron secret is invalid.", 403);
    }
    if (!isCron) await authenticateAdmin(req, db);

    if (action === "config_status") {
      const settings = await getMerchantSettings(db);
      return json({
        configured: !!Deno.env.get("GOOGLE_MERCHANT_CLIENT_ID")
          && !!Deno.env.get("GOOGLE_MERCHANT_CLIENT_SECRET")
          && !!Deno.env.get("GOOGLE_MERCHANT_REFRESH_TOKEN"),
        merchant_id: settings.merchant_id,
        data_source_id: settings.data_source_id,
        is_connected: settings.is_connected,
        auto_sync: settings.auto_sync,
        website_url: settings.website_url,
        target_country: settings.target_country,
        language: settings.language,
      });
    }

    if (action === "save_config") {
      const merchantId = String(body.merchant_id ?? "").trim();
      const dataSourceId = String(body.data_source_id ?? "").trim();
      const accountEmail = String(body.account_email ?? "").trim();
      const websiteUrl = String(body.website_url ?? "").trim();
      const targetCountry = String(body.target_country ?? "NG").trim().toUpperCase();
      const language = String(body.language ?? "en").trim().toLowerCase();
      const autoSync = Boolean(body.auto_sync ?? true);
      if (!websiteUrl || !/^https:\/\//i.test(websiteUrl)) {
        throw new UserError("A valid HTTPS product website URL is required.", 400);
      }
      await verifyMerchantConfiguration(merchantId, dataSourceId);

      const { error } = await db.from("google_merchant_settings").upsert({
        id: true,
        merchant_id: merchantId,
        data_source_id: dataSourceId,
        account_email: accountEmail || null,
        website_url: websiteUrl.replace(/\/+$/, ""),
        target_country: targetCountry || "NG",
        language: language || "en",
        auto_sync: autoSync,
        is_connected: true,
        last_error: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });
      if (error) throw error;
      await saveLog(db, "save_config", "success", `Verified Merchant Center account ${merchantId} and existing data source ${dataSourceId}.`, {
        merchant_id: merchantId,
        data_source_id: dataSourceId,
        account_email: accountEmail || null,
      });
      return json({ success: true, merchant_id: merchantId, data_source_id: dataSourceId, connected: true });
    }

    if (action === "sync_product") {
      const productId = String(body.product_id ?? "").trim();
      if (!productId) throw new UserError("A product ID is required.", 400);
      let result: Awaited<ReturnType<typeof syncProduct>>;
      try {
        result = await syncProduct(db, productId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Product synchronization failed.";
        await recordProductFailure(db, productId, message);
        throw error;
      }
      const { error } = await db.from("google_merchant_sync_queue").delete().eq("product_id", productId);
      if (error) throw error;
      return json({ success: true, ...result });
    }

    if (action === "sync_catalog") {
      const result = await syncQueueBatch(db, isCron);
      return json({ success: true, ...result });
    }

    if (action === "status") {
      const settings = await getMerchantSettings(db);
      const [stats, { data: products, error: productsError }, { data: logs, error: logsError },
        { data: candidates, error: candidatesError }] = await Promise.all([
        catalogStats(db),
        db.from("google_merchant_products").select("*").order("updated_at", { ascending: false }).limit(25),
        db.from("google_merchant_sync_logs").select("*").order("created_at", { ascending: false }).limit(12),
        db.from("products").select(productColumns)
          .eq("is_public", true).eq("is_active", true).eq("vendors.is_approved", true)
          .gt("price", 0).order("created_at", { ascending: false }).limit(100),
      ]);
      if (productsError) throw productsError;
      if (logsError) throw logsError;
      if (candidatesError) throw candidatesError;
      const catalogue = (candidates ?? [])
        .filter((product: Record<string, unknown>) => isEligible(product))
        .slice(0, 25)
        .map((product: Record<string, unknown>) => ({ id: product.id, name: product.name, price: product.price }));
      return json({ settings, stats, products: products ?? [], catalogue, logs: logs ?? [] });
    }

    throw new UserError("Unknown action.", 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Google Merchant error.";
    const status = error instanceof UserError ? error.status : 500;
    if (db) {
      try {
        await saveLog(db, "request", "error", message);
      } catch {
        console.error("Could not save Google Merchant request error log.", message);
      }
    }
    return json({ error: message }, status);
  }
});
