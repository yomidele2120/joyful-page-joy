// @vitest-environment node
import { describe, expect, it } from 'vitest';
// The server-side rules that publish or fail a post (the same file the edge functions import).
import { applyStreamState, friendlyStreamError } from '../../../supabase/functions/_shared/stream';

function fakeAdmin() {
  const updates: { patch: Record<string, unknown>; filters: Record<string, unknown> }[] = [];
  const admin = {
    from: () => ({
      update: (patch: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain: any = {
          eq: (c: string, v: unknown) => { filters[c] = v; return chain; },
          in: (c: string, v: unknown) => { filters[c] = v; return chain; },
          then: (res: (v: unknown) => void) => { updates.push({ patch, filters }); res({ error: null }); },
        };
        return chain;
      },
    }),
  };
  return { admin, updates };
}

describe('applyStreamState', () => {
  it('publishes the post when Cloudflare says the video is ready', async () => {
    const { admin, updates } = fakeAdmin();
    const out = await applyStreamState(admin, { uid: 'u1', readyToStream: true, duration: 42.5, status: { state: 'ready' } });
    expect(out).toBe('ready');
    expect(updates[0].patch.is_active).toBe(true);
    expect(updates[0].patch.processing_status).toBe('ready');
    expect(updates[0].patch.duration_seconds).toBe(42.5);
    expect(updates[0].filters.stream_uid).toBe('u1');
    // only ever touches unfinished posts, so a moderator's takedown is never undone
    expect(updates[0].filters.processing_status).toEqual(['uploading', 'processing']);
  });

  it('goes live as soon as the first quality level is playable', async () => {
    const { admin } = fakeAdmin();
    expect(await applyStreamState(admin, { uid: 'u1', readyToStream: true, status: { state: 'inprogress' } })).toBe('ready');
  });

  it('records why a video failed, in words the seller understands, and keeps it hidden', async () => {
    const { admin, updates } = fakeAdmin();
    const out = await applyStreamState(admin, { uid: 'u1', status: { state: 'error', errReasonCode: 'ERR_DURATION_EXCEED_CONSTRAINT' } });
    expect(out).toBe('failed');
    expect(updates[0].patch.is_active).toBe(false);
    expect(String(updates[0].patch.processing_error)).toContain('longer than 3 minutes');
  });

  it('moves to "processing" once the file has arrived, and does nothing while the upload is still pending', async () => {
    const a = fakeAdmin();
    expect(await applyStreamState(a.admin, { uid: 'u1', status: { state: 'queued' } })).toBe('processing');
    expect(a.updates[0].patch.processing_status).toBe('processing');
    const b = fakeAdmin();
    expect(await applyStreamState(b.admin, { uid: 'u1', status: { state: 'pendingupload' } })).toBe('uploading');
    expect(b.updates).toHaveLength(0);
  });

  it('ignores a report with no video id', async () => {
    const { admin, updates } = fakeAdmin();
    expect(await applyStreamState(admin, { status: { state: 'ready' } })).toBe('unchanged');
    expect(updates).toHaveLength(0);
  });

  it('has a plain message for unknown errors', () => {
    expect(friendlyStreamError('ERR_SOMETHING_NEW')).toContain('ERR_SOMETHING_NEW');
  });
});
