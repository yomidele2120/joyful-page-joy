import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifyResendWebhook } from '../../supabase/functions/_shared/resendWebhook';

const secretBytes = new TextEncoder().encode('test-resend-webhook-secret');
const secret = `whsec_${Buffer.from(secretBytes).toString('base64')}`;
const eventId = 'evt_test_123';
const timestamp = 1_800_000_000;
const body = JSON.stringify({ type: 'email.delivered', data: { email_id: 're_test_123', tags: { job_id: 'job-1' } } });

async function signatureFor(payload: string, id = eventId, time = timestamp) {
  const key = await webcrypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const message = new TextEncoder().encode(`${id}.${time}.${payload}`);
  const signature = new Uint8Array(await webcrypto.subtle.sign('HMAC', key, message));
  return `v1,${Buffer.from(signature).toString('base64')}`;
}

beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto);
});

describe('Resend webhook signature verification', () => {
  it('accepts a signed raw event and returns its payload', async () => {
    const signature = await signatureFor(body);
    const event = await verifyResendWebhook(body, { id: eventId, timestamp: String(timestamp), signature }, secret, timestamp);
    expect(event.type).toBe('email.delivered');
    expect(event.data.email_id).toBe('re_test_123');
  });

  it('rejects tampered payloads and stale timestamps', async () => {
    const signature = await signatureFor(body);
    await expect(verifyResendWebhook(`${body} `, { id: eventId, timestamp: String(timestamp), signature }, secret, timestamp)).rejects.toThrow('Invalid Resend webhook signature');
    await expect(verifyResendWebhook(body, { id: eventId, timestamp: String(timestamp), signature }, secret, timestamp + 301)).rejects.toThrow('outside allowed window');
  });

  it('rejects a signature from a different event id', async () => {
    const signature = await signatureFor(body, 'another-event');
    await expect(verifyResendWebhook(body, { id: eventId, timestamp: String(timestamp), signature }, secret, timestamp)).rejects.toThrow('Invalid Resend webhook signature');
  });
});
