import { createSign, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  buildMerchantProductInput,
  classifyMerchantApproval,
  merchantEligibilityError,
  type MerchantProduct,
} from './_lib/googleMerchant';

interface Request {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface Response {
  status(code: number): Response;
  setHeader(name: string, value: string): Response;
  json(body: unknown): void;
}

interface Settings {
  merchant_account_id: string | null;
  data_source_id: string | null;
  feed_label: string;
  content_language: string;
  currency_code: string;
  enabled: boolean;
}

interface QueueJob {
  product_id: string;
  operation: 'upsert' | 'delete';
  attempts: number;
  version: number;
}

class HttpError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}

class GoogleError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
  }
}

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/content';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PRODUCTS_API = 'https://merchantapi.googleapis.com/products/v1';
const GOOGLE_DATA_SOURCES_API = 'https://merchantapi.googleapis.com/datasources/v1';
const SERVICE_ACCOUNT_ENV = 'GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let cachedAccessToken: { value: string; expiresAt: number } | null = null;
let pendingAccessToken: Promise<string> | null = null;

function header(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? '';
}

function database() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError('The server Supabase URL or service-role key is not configured.', 503);
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function serviceAccountConfigured(): boolean {
  return Boolean(process.env[SERVICE_ACCOUNT_ENV]);
}

function parseServiceAccount() {
  const raw = process.env[SERVICE_ACCOUNT_ENV];
  if (!raw) throw new HttpError(`Add ${SERVICE_ACCOUNT_ENV} to the Vercel server environment.`, 503);
  try {
    const credentials = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!credentials.client_email || !credentials.private_key) throw new Error('Missing service account fields');
    return { clientEmail: credentials.client_email, privateKey: credentials.private_key.replace(/\\n/g, '\n') };
  } catch {
    throw new HttpError(`${SERVICE_ACCOUNT_ENV} must contain the Google service-account JSON object.`, 503);
  }
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

async function googleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.value;
  if (pendingAccessToken) return pendingAccessToken;

  pendingAccessToken = (async () => {
    const credentials = parseServiceAccount();
    const issuedAt = Math.floor(Date.now() / 1000);
    const unsigned = `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64Url(JSON.stringify({
      iss: credentials.clientEmail,
      scope: GOOGLE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }))}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(credentials.privateKey);
    const assertion = `${unsigned}.${base64Url(signature)}`;
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!response.ok || !result.access_token) {
      throw new HttpError(result.error_description || `Google authentication failed (${response.status}).`, 502);
    }
    cachedAccessToken = { value: result.access_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000 };
    return result.access_token;
  })();
  try {
    return await pendingAccessToken;
  } finally {
    pendingAccessToken = null;
  }
}

async function googleRequest<T>(url: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = await googleAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } } & T;
  if (response.status === 401 && !retried) {
    cachedAccessToken = null;
    return googleRequest<T>(url, init, true);
  }
  if (!response.ok) {
    throw new GoogleError(body.error?.message || `Merchant API request failed (${response.status}).`, response.status);
  }
  return body;
}

async function settingsFromDatabase(db: ReturnType<typeof database>): Promise<Settings> {
  const { data, error } = await db.from('merchant_center_settings').select('*').eq('id', true).maybeSingle();
  if (error) throw new HttpError(`Merchant Center settings are unavailable. Apply the Google Merchant Center database migration. ${error.message}`, 503);
  return data ?? {
    merchant_account_id: null,
    data_source_id: null,
    feed_label: 'NG',
    content_language: 'en',
    currency_code: 'NGN',
    enabled: false,
  };
}

function validateSettings(settings: Partial<Settings>): asserts settings is Settings {
  if (!settings.merchant_account_id || !/^\d+$/.test(settings.merchant_account_id)) {
    throw new HttpError('Enter the numeric Merchant Center account ID.');
  }
  if (!settings.data_source_id || !/^accounts\/\d+\/dataSources\/\d+$/.test(settings.data_source_id)) {
    throw new HttpError('Enter the API data source name, for example accounts/123456789/dataSources/987654321.');
  }
  if (settings.data_source_id.split('/')[1] !== settings.merchant_account_id) {
    throw new HttpError('The data source must belong to the configured Merchant Center account.');
  }
  if (!settings.feed_label || !/^[A-Z0-9_-]{1,20}$/.test(settings.feed_label)) {
    throw new HttpError('Feed label must contain only uppercase letters, numbers, hyphens, or underscores (max 20 characters).');
  }
  if (!settings.content_language || !/^[a-z]{2}$/.test(settings.content_language)) {
    throw new HttpError('Content language must be a two-letter lowercase language code.');
  }
  if (!settings.currency_code || !/^[A-Z]{3}$/.test(settings.currency_code)) {
    throw new HttpError('Currency must be a three-letter uppercase currency code.');
  }
}

function accountPath(settings: Settings): string {
  validateSettings(settings);
  return `accounts/${settings.merchant_account_id}`;
}

function dataSourceName(settings: Settings): string {
  validateSettings(settings);
  return settings.data_source_id!;
}

function productKey(settings: Settings, offerId: string): string {
  return `${settings.content_language}~${settings.feed_label}~${offerId}`;
}

function productInputUrl(settings: Settings): string {
  const key = encodeURIComponent(dataSourceName(settings));
  return `${GOOGLE_PRODUCTS_API}/${accountPath(settings)}/productInputs:insert?dataSource=${key}`;
}

function productDeleteUrl(settings: Settings, offerId: string): string {
  const productName = `${accountPath(settings)}/productInputs/${encodeURIComponent(productKey(settings, offerId))}`;
  return `${GOOGLE_PRODUCTS_API}/${productName}?dataSource=${encodeURIComponent(dataSourceName(settings))}`;
}

function productReadUrl(settings: Settings, offerId: string): string {
  const productName = `${accountPath(settings)}/products/${encodeURIComponent(productKey(settings, offerId))}`;
  return `${GOOGLE_PRODUCTS_API}/${productName}`;
}

async function authorizeAdmin(req: Request) {
  const authorization = header(req.headers.authorization);
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new HttpError('Sign in as an administrator to continue.', 401);

  const db = database();
  const { data: { user }, error: authError } = await db.auth.getUser(token);
  if (authError || !user) throw new HttpError('Your session is invalid or expired.', 401);
  const { data: role, error: roleError } = await db.from('user_roles')
    .select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
  if (roleError) throw new HttpError('Could not verify administrator access.', 503);
  if (!role) throw new HttpError('Administrator access is required.', 403);
  return { db, user };
}

function cronSecretMatches(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const provided = header(req.headers.authorization).replace(/^Bearer\s+/i, '');
  if (!secret || !provided) return false;
  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function response(res: Response, statusCode: number, body: unknown) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(statusCode).json(body);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected Merchant Center error.';
}

function siteUrl(): string {
  const url = process.env.SITE_URL || 'https://www.ithubafrica.com';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') throw new Error('SITE_URL must use HTTPS.');
    return parsed.origin;
  } catch (error) {
    throw new HttpError(errorMessage(error), 503);
  }
}

async function writeHistory(
  db: ReturnType<typeof database>,
  productId: string,
  title: string,
  operation: string,
  result: 'submitted' | 'deleted' | 'ineligible' | 'failed',
  message: string | null,
) {
  const { error } = await db.from('merchant_center_sync_history').insert({
    product_id: productId,
    product_title: title,
    operation,
    result,
    message: message?.slice(0, 2000) ?? null,
  });
  if (error) throw new Error(`Could not record synchronization history: ${error.message}`);
}

async function updateProductStatus(
  db: ReturnType<typeof database>,
  values: Record<string, unknown>,
) {
  const { error } = await db.from('merchant_center_product_status').upsert(values, { onConflict: 'product_id' });
  if (error) throw new Error(`Could not save product synchronization status: ${error.message}`);
}

async function processJob(db: ReturnType<typeof database>, settings: Settings, job: QueueJob) {
  const { data: product, error: productError } = await db.from('products')
    .select('id,name,slug,description,price,brand,image_url,stock_quantity,is_active,is_public,is_preorder,specs,vendor_id,vendors(is_approved),categories(name)')
    .eq('id', job.product_id)
    .maybeSingle();
  if (productError) throw new Error(`Could not load product ${job.product_id}: ${productError.message}`);

  const listing = product as MerchantProduct | null;
  const ineligibleReason = listing ? merchantEligibilityError(listing) : 'The listing was deleted.';
  const shouldDelete = job.operation === 'delete' || Boolean(ineligibleReason);
  if (shouldDelete) {
    try {
      await googleRequest(productDeleteUrl(settings, job.product_id), { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof GoogleError && error.statusCode === 404)) throw error;
    }
    const title = listing?.name || job.product_id;
    await updateProductStatus(db, {
      product_id: job.product_id,
      offer_id: job.product_id,
      product_title: title,
      sync_status: ineligibleReason && job.operation !== 'delete' ? 'ineligible' : 'deleted',
      approval_status: 'not_submitted',
      issues: [],
      last_error: ineligibleReason && job.operation !== 'delete' ? ineligibleReason : null,
      status_error: null,
      last_synced_at: new Date().toISOString(),
      status_checked_at: null,
      updated_at: new Date().toISOString(),
    });
    const result = ineligibleReason && job.operation !== 'delete' ? 'ineligible' : 'deleted';
    await writeHistory(db, job.product_id, title, 'delete', result, result === 'ineligible' ? ineligibleReason : null);
    const { error } = await db.from('merchant_center_sync_queue').delete()
      .eq('product_id', job.product_id).eq('version', job.version);
    if (error) throw new Error(`Could not clear the completed sync job: ${error.message}`);
    return { result, productId: job.product_id };
  }

  const input = buildMerchantProductInput(listing!, {
    siteUrl: siteUrl(),
    feedLabel: settings.feed_label,
    contentLanguage: settings.content_language,
    currencyCode: settings.currency_code,
  });
  await googleRequest(productInputUrl(settings), { method: 'POST', body: JSON.stringify(input) });
  const now = new Date().toISOString();
  await updateProductStatus(db, {
    product_id: job.product_id,
    offer_id: job.product_id,
    product_title: listing!.name,
    sync_status: 'submitted',
    approval_status: 'pending',
    issues: [],
    last_error: null,
    status_error: null,
    last_synced_at: now,
    status_checked_at: null,
    updated_at: now,
  });
  await writeHistory(db, job.product_id, listing!.name, 'upsert', 'submitted', null);
  const { error } = await db.from('merchant_center_sync_queue').delete()
    .eq('product_id', job.product_id).eq('version', job.version);
  if (error) throw new Error(`Could not clear the completed sync job: ${error.message}`);
  return { result: 'submitted', productId: job.product_id };
}

async function recordJobFailure(db: ReturnType<typeof database>, job: QueueJob, error: unknown) {
  const message = errorMessage(error).slice(0, 2000);
  const attempts = Number(job.attempts) || 1;
  const failed = attempts >= 8;
  const delayMinutes = Math.min(60 * 12, 2 ** Math.min(attempts, 9));
  const nextAttempt = new Date(Date.now() + delayMinutes * 60_000).toISOString();
  const { data: updatedJobs, error: queueError } = await db.from('merchant_center_sync_queue').update({
    status: failed ? 'failed' : 'pending',
    next_attempt_at: nextAttempt,
    locked_until: null,
    last_error: message,
    updated_at: new Date().toISOString(),
  }).eq('product_id', job.product_id).eq('version', job.version).select('product_id');
  if (queueError) throw new Error(`Could not schedule retry for ${job.product_id}: ${queueError.message}`);
  if (!updatedJobs?.length) return;

  const { data: product } = await db.from('products').select('name').eq('id', job.product_id).maybeSingle();
  const title = product?.name || job.product_id;
  await updateProductStatus(db, {
    product_id: job.product_id,
    offer_id: job.product_id,
    product_title: title,
    sync_status: 'failed',
    approval_status: 'pending',
    last_error: message,
    updated_at: new Date().toISOString(),
  });
  await writeHistory(db, job.product_id, title, job.operation, 'failed', message);
  console.error('Merchant Center product sync failed', { productId: job.product_id, attempts, message });
}

async function processQueue(
  db: ReturnType<typeof database>,
  settings: Settings,
  limit: number,
  productId?: string,
) {
  const { data, error } = await db.rpc('merchant_claim_product_sync_jobs', {
    _limit: limit,
    _product_id: productId ?? null,
  });
  if (error) throw new Error(`Could not claim Merchant Center sync jobs: ${error.message}`);

  const jobs = (data ?? []) as QueueJob[];
  const results: Array<{ result: string; productId: string }> = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      try {
        results.push(await processJob(db, settings, job));
      } catch (error) {
        await recordJobFailure(db, job, error);
        results.push({ result: 'failed', productId: job.product_id });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, jobs.length) }, () => worker()));
  return {
    claimed: jobs.length,
    submitted: results.filter((item) => item.result === 'submitted').length,
    deleted: results.filter((item) => item.result === 'deleted').length,
    ineligible: results.filter((item) => item.result === 'ineligible').length,
    failed: results.filter((item) => item.result === 'failed').length,
  };
}

async function refreshProductStatuses(db: ReturnType<typeof database>, settings: Settings, limit: number) {
  const { data: products, error } = await db.from('merchant_center_product_status')
    .select('product_id,offer_id')
    .eq('sync_status', 'submitted')
    .order('status_checked_at', { ascending: true, nullsFirst: true })
    .limit(Math.min(100, Math.max(1, limit)));
  if (error) throw new Error(`Could not load Merchant Center statuses: ${error.message}`);

  let checked = 0;
  let failed = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < (products ?? []).length) {
      const product = products![cursor++];
      try {
        const remote = await googleRequest<{ productStatus?: unknown }>(
          productReadUrl(settings, product.offer_id),
          { signal: AbortSignal.timeout(10_000) },
        );
        const approval = classifyMerchantApproval(remote.productStatus, settings.feed_label);
        const { error: updateError } = await db.from('merchant_center_product_status').update({
          approval_status: approval.status,
          issues: approval.issues,
          status_error: null,
          status_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('product_id', product.product_id);
        if (updateError) throw new Error(updateError.message);
        checked++;
      } catch (error) {
        const message = error instanceof GoogleError && error.statusCode === 404
          ? 'Google is still processing this product.'
          : errorMessage(error).slice(0, 1000);
        const { error: updateError } = await db.from('merchant_center_product_status').update({
          status_error: message,
          status_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('product_id', product.product_id);
        if (updateError) throw new Error(`Could not save Google status refresh error: ${updateError.message}`);
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, products?.length ?? 0) }, () => worker()));
  return { checked, failed };
}

async function dashboardData(db: ReturnType<typeof database>, settings: Settings) {
  const [{ data: history, error: historyError }, { data: products, error: productsError }, { count: pending, error: queueError }] = await Promise.all([
    db.from('merchant_center_sync_history').select('*').order('created_at', { ascending: false }).limit(50),
    db.from('merchant_center_product_status').select('*').order('updated_at', { ascending: false }).limit(100),
    db.from('merchant_center_sync_queue').select('*', { count: 'exact', head: true }).neq('status', 'failed'),
  ]);
  if (historyError || productsError || queueError) {
    throw new HttpError(`Could not load Merchant Center dashboard data: ${historyError?.message || productsError?.message || queueError?.message}`, 503);
  }
  return {
    settings,
    credentialsConfigured: serviceAccountConfigured(),
    cronConfigured: Boolean(process.env.CRON_SECRET),
    pendingJobs: pending ?? 0,
    history: history ?? [],
    products: products ?? [],
  };
}

function readBody(req: Request): Record<string, unknown> {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body) as Record<string, unknown>; }
    catch { throw new HttpError('Request body must be valid JSON.'); }
  }
  return req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
}

async function handleCron(res: Response) {
  try {
    const db = database();
    const settings = await settingsFromDatabase(db);
    if (!settings.enabled) {
      response(res, 200, { skipped: true, reason: 'Merchant Center synchronization is disabled.' });
      return;
    }
    validateSettings(settings);
    const synchronization = await processQueue(db, settings, 10);
    const statuses = await refreshProductStatuses(db, settings, 10);
    response(res, 200, { synchronization, statuses });
  } catch (error) {
    console.error('Merchant Center scheduled sync failed', errorMessage(error));
    response(res, error instanceof HttpError ? error.statusCode : 500, { error: errorMessage(error) });
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET' && header(req.query?.cron) === '1') {
    if (!cronSecretMatches(req)) {
      response(res, 401, { error: 'Invalid scheduler authorization.' });
      return;
    }
    await handleCron(res);
    return;
  }

  try {
    if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError('Method not allowed.', 405);
    const { db, user } = await authorizeAdmin(req);
    if (req.method === 'GET') {
      const settings = await settingsFromDatabase(db);
      response(res, 200, await dashboardData(db, settings));
      return;
    }

    const body = readBody(req);
    const action = String(body.action ?? '');
    const settings = await settingsFromDatabase(db);

    if (action === 'save_settings') {
      const submitted = body.settings as Partial<Settings> | undefined;
      const updated: Settings = {
        merchant_account_id: String(submitted?.merchant_account_id ?? '').trim() || null,
        data_source_id: String(submitted?.data_source_id ?? '').trim() || null,
        feed_label: String(submitted?.feed_label ?? 'NG').trim().toUpperCase(),
        content_language: String(submitted?.content_language ?? 'en').trim().toLowerCase(),
        currency_code: String(submitted?.currency_code ?? 'NGN').trim().toUpperCase(),
        enabled: submitted?.enabled === true,
      };
      if (updated.enabled && !serviceAccountConfigured()) {
        throw new HttpError(`Add ${SERVICE_ACCOUNT_ENV} to the Vercel server environment before enabling synchronization.`, 503);
      }
      if (updated.enabled) validateSettings(updated);
      if (updated.merchant_account_id || updated.data_source_id) validateSettings({ ...updated, enabled: true });

      const { error } = await db.from('merchant_center_settings').upsert({
        id: true,
        ...updated,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, { onConflict: 'id' });
      if (error) throw new HttpError(`Could not save Merchant Center settings: ${error.message}`, 503);
      response(res, 200, { settings: updated });
      return;
    }

    if (action === 'verify_connection') {
      const candidate = body.settings
        ? { ...settings, ...(body.settings as Partial<Settings>) }
        : settings;
      validateSettings(candidate);
      const url = `${GOOGLE_DATA_SOURCES_API}/${accountPath(candidate)}/dataSources/${candidate.data_source_id!.split('/').at(-1)}`;
      const source = await googleRequest<{ name?: string; dataSourceType?: string }>(url);
      if (source.dataSourceType && source.dataSourceType !== 'API') {
        throw new HttpError('The selected Merchant Center data source is not an API data source.', 400);
      }
      response(res, 200, { verified: true, dataSource: source.name ?? candidate.data_source_id });
      return;
    }

    if (action === 'sync_all') {
      if (!settings.enabled) throw new HttpError('Save and enable the Merchant Center connection first.', 409);
      validateSettings(settings);
      const { data: queued, error } = await db.rpc('merchant_queue_all_eligible_products');
      if (error) throw new HttpError(`Could not queue the catalogue: ${error.message}`, 503);
      const synchronization = await processQueue(db, settings, 15);
      response(res, 200, { queued: Number(queued) || 0, synchronization });
      return;
    }

    if (action === 'sync_product') {
      if (!settings.enabled) throw new HttpError('Save and enable the Merchant Center connection first.', 409);
      validateSettings(settings);
      const productId = String(body.productId ?? '');
      if (!UUID.test(productId)) throw new HttpError('Product ID must be a valid UUID.');
      const { error } = await db.rpc('enqueue_merchant_product_sync', {
        _product_id: productId,
        _operation: 'upsert',
      });
      if (error) throw new HttpError(`Could not queue the product: ${error.message}`, 503);
      const synchronization = await processQueue(db, settings, 1, productId);
      response(res, 200, { synchronization });
      return;
    }

    if (action === 'retry_failed') {
      if (!settings.enabled) throw new HttpError('Save and enable the Merchant Center connection first.', 409);
      validateSettings(settings);
      const { error } = await db.rpc('merchant_retry_failed_sync_jobs');
      if (error) throw new HttpError(`Could not requeue failed products: ${error.message}`, 503);
      const synchronization = await processQueue(db, settings, 15);
      response(res, 200, { synchronization });
      return;
    }

    if (action === 'refresh_status') {
      if (!settings.enabled) throw new HttpError('Save and enable the Merchant Center connection first.', 409);
      validateSettings(settings);
      response(res, 200, await refreshProductStatuses(db, settings, 15));
      return;
    }

    throw new HttpError('Unknown Merchant Center action.');
  } catch (error) {
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    if (statusCode >= 500) console.error('Merchant Center API request failed', errorMessage(error));
    response(res, statusCode, { error: errorMessage(error) });
  }
}
