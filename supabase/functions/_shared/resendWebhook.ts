export interface ResendWebhookPayload {
  type: string;
  created_at?: string;
  data: {
    email_id?: string;
    tags?: Record<string, string>;
    [key: string]: unknown;
  };
}

export interface ResendWebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyResendWebhook(
  rawBody: string,
  headers: ResendWebhookHeaders,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<ResendWebhookPayload> {
  if (!rawBody || !headers.id || !headers.timestamp || !headers.signature || !secret.startsWith('whsec_')) {
    throw new Error('Missing Resend webhook signature data');
  }
  if (!/^\d+$/.test(headers.timestamp)) throw new Error('Invalid Resend webhook timestamp');
  const timestamp = Number(headers.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300) {
    throw new Error('Resend webhook timestamp outside allowed window');
  }

  let keyBytes: Uint8Array;
  try { keyBytes = decodeBase64(secret.slice('whsec_'.length)); }
  catch { throw new Error('Invalid Resend webhook secret'); }
  if (!keyBytes.length) throw new Error('Invalid Resend webhook secret');

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signedContent = new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${rawBody}`);
  const expected = encodeBase64(new Uint8Array(await crypto.subtle.sign('HMAC', key, signedContent)));
  const signatures = headers.signature.split(' ').map(value => value.trim()).filter(Boolean);
  const valid = signatures.some(value => {
    const parts = value.split(',');
    return parts.length === 2 && parts[0] === 'v1' && constantTimeEqual(parts[1], expected);
  });
  if (!valid) throw new Error('Invalid Resend webhook signature');

  let payload: unknown;
  try { payload = JSON.parse(rawBody); }
  catch { throw new Error('Invalid Resend webhook JSON'); }
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Resend webhook payload');
  const event = payload as Partial<ResendWebhookPayload>;
  if (typeof event.type !== 'string' || typeof event.data !== 'object' || !event.data) {
    throw new Error('Invalid Resend webhook payload');
  }
  return event as ResendWebhookPayload;
}
