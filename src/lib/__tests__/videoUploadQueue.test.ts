// @vitest-environment node
import { describe, expect, it } from 'vitest';

// The whole journey of a video with a fake server standing in for Supabase and Cloudflare:
// pick -> upload (cut off) -> app closed -> reopened -> resumes -> optimised on the server -> live.

const MB = 1024 * 1024;

interface FakePost { processing_status: string; processing_error: string | null }
const db = { posts: new Map<string, FakePost>(), createCalls: 0, networkDown: false };
const cf = { held: 0, patches: [] as number[], size: 0, dropAfter: Infinity };

// ---- fake Supabase client ----
const fakeSupabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
  functions: {
    invoke: async (name: string, opts?: { body?: { postId?: string; size?: number } }) => {
      if (db.networkDown) return { data: null, error: { message: 'Failed to fetch' } };
      if (name === 'check-stream-post') return { data: { posts: [] }, error: null };
      db.createCalls++;
      const postId = opts?.body?.postId ?? `post-${db.createCalls}`;
      db.posts.set(postId, { processing_status: 'uploading', processing_error: null });
      cf.size = opts?.body?.size ?? 0;
      return { data: { postId, uploadUrl: 'https://upload.test/tus/abc', uid: 'uid-1' }, error: null };
    },
  },
  from: (_t: string) => ({
    select: () => ({ eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: db.posts.get(id) ?? null, error: null }) }) }),
    delete: () => ({ eq: (_c: string, id: string) => ({ neq: async () => { db.posts.delete(id); return { error: null }; } }) }),
  }),
  storage: { from: () => ({}) },
};

(globalThis as any).__fakeSupabase = fakeSupabase;

// ---- fake Cloudflare tus endpoint (global fetch) ----
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  const h = (init?.headers ?? {}) as Record<string, string>;
  if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': String(cf.held) } });
  const offset = Number(h['Upload-Offset']);
  if (offset !== cf.held) return new Response(null, { status: 409 });
  if (cf.held >= cf.dropAfter) throw new TypeError('network lost');
  cf.patches.push(offset);
  cf.held += (init!.body as Blob).size;
  if (cf.held >= cf.size) for (const p of db.posts.values()) p.processing_status = 'processing'; // Cloudflare starts optimising
  return new Response(null, { status: 204, headers: { 'Upload-Offset': String(cf.held) } });
}) as typeof fetch;

(globalThis as any).window = { addEventListener() {}, removeEventListener() {} };
(globalThis as any).document = { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' };

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(check: () => boolean, ms = 5000) {
  const t0 = Date.now();
  while (!check()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting'); await wait(15); }
}

describe('video upload queue', () => {
  it('survives the app being closed mid-upload, resumes without re-sending, and ends up published', async () => {
    const mod = await import('@/lib/videoUploadQueue');
    const q = mod.videoUploadQueue;
    q.timing = { watchEveryMs: 20, watchForMs: 5000, retryAfterMs: 30 };
    const published: string[] = [];
    const hooks = { onPostsChanged: () => undefined, onPublished: (j: { id: string }) => published.push(j.id) };

    cf.held = 0; cf.patches = []; cf.dropAfter = 8 * MB; // the connection dies after the first 8 MB chunk
    await q.start('user-1', hooks);
    const file = new File([new Uint8Array(20 * MB)], 'clip.mp4', { type: 'video/mp4' });
    await q.enqueue({ userId: 'user-1', vendorId: 'v1', file, caption: 'New stock', productId: null });

    await until(() => cf.held === 8 * MB);          // first chunk reached the server
    // The phone loses signal then the seller closes the app: everything in memory is gone.
    q.stop();
    await wait(50);
    expect(db.posts.size).toBe(1);                   // the (hidden) post exists on the server already
    expect([...db.posts.values()][0].processing_status).toBe('uploading');

    // Seller comes back later with signal.
    cf.dropAfter = Infinity;
    await q.start('user-1', hooks);                  // reads the saved job + video back
    await until(() => cf.held === 20 * MB);
    expect(cf.patches).toEqual([0, 8 * MB, 16 * MB]); // never re-sent the first chunk, no skipped bytes
    expect(db.createCalls).toBe(1);                  // reused the same server-side post and upload address

    // Now the phone is irrelevant: Cloudflare finishes and the server publishes (webhook).
    await until(() => q.getSnapshot()[0]?.phase === 'processing');
    expect(q.getSnapshot()[0].message).toContain('close the app');
    [...db.posts.values()][0].processing_status = 'ready';
    await until(() => published.length === 1);
    expect(q.getSnapshot()).toHaveLength(0);         // job cleaned up
    q.stop();
  });

  it('keeps the video and retries by itself when there is no signal at the moment of posting', async () => {
    const mod = await import('@/lib/videoUploadQueue');
    const q = mod.videoUploadQueue;
    q.timing = { watchEveryMs: 20, watchForMs: 5000, retryAfterMs: 30 };
    const published: string[] = [];
    const hooks = { onPostsChanged: () => undefined, onPublished: (j: { id: string }) => published.push(j.id) };
    db.posts.clear(); db.createCalls = 0; cf.held = 0; cf.patches = []; cf.dropAfter = Infinity;

    db.networkDown = true;
    await q.start('user-2', hooks);
    await q.enqueue({ userId: 'user-2', vendorId: 'v1', file: new File([new Uint8Array(1 * MB)], 'a.mp4', { type: 'video/mp4' }), caption: '', productId: null });
    await until(() => q.getSnapshot()[0]?.message?.includes('Waiting for a connection') === true);
    expect(q.getSnapshot()[0].phase).toBe('queued');   // not failed: it is waiting

    db.networkDown = false;                              // signal is back
    await until(() => q.getSnapshot()[0]?.phase === 'processing');
    [...db.posts.values()][0].processing_status = 'ready';
    await until(() => published.length === 1);
    q.stop();
  });

  it('shows the real reason when the server rejects the video, and lets the seller try again', async () => {
    const mod = await import('@/lib/videoUploadQueue');
    const q = mod.videoUploadQueue;
    q.timing = { watchEveryMs: 20, watchForMs: 5000, retryAfterMs: 30 };
    db.posts.clear(); cf.held = 0; cf.dropAfter = Infinity;
    const hooks = { onPostsChanged: () => undefined, onPublished: () => undefined };
    await q.start('user-3', hooks);
    await q.enqueue({ userId: 'user-3', vendorId: 'v1', file: new File([new Uint8Array(1 * MB)], 'b.mp4', { type: 'video/mp4' }), caption: '', productId: null });
    await until(() => q.getSnapshot()[0]?.phase === 'processing');
    // Cloudflare could not read the file: the server records why, the seller sees it.
    [...db.posts.values()][0].processing_status = 'failed';
    [...db.posts.values()][0].processing_error = 'This file could not be read as a video. Please try a different video.';
    await until(() => q.getSnapshot()[0]?.phase === 'failed');
    expect(q.getSnapshot()[0].error).toContain('could not be read as a video');
    q.stop();
  });
});
