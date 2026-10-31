// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TusExpiredError, tusUpload } from '@/lib/tus';

// A tiny in-memory tus server: tracks how many bytes it holds and answers HEAD / PATCH like Cloudflare does.
function fakeServer(opts: { failPatchOnce?: number[]; expired?: boolean } = {}) {
  let held = 0;
  const log: string[] = [];
  const failAt = new Set(opts.failPatchOnce ?? []);
  const impl = (async (_url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (opts.expired) return new Response(null, { status: 404 });
    if (method === 'HEAD') { log.push('HEAD'); return new Response(null, { status: 200, headers: { 'Upload-Offset': String(held) } }); }
    const offset = Number(headers['Upload-Offset']);
    log.push(`PATCH@${offset}`);
    if (failAt.has(offset)) { failAt.delete(offset); throw new TypeError('network down'); }
    if (offset !== held) return new Response(null, { status: 409 });
    held += (init!.body as Blob).size;
    return new Response(null, { status: 204, headers: { 'Upload-Offset': String(held) } });
  }) as unknown as typeof fetch;
  return { impl, log, held: () => held };
}

describe('tusUpload', () => {
  const file = new Blob([new Uint8Array(10 * 1024)]);

  it('sends the whole file in chunks and reports progress', async () => {
    const s = fakeServer();
    const seen: number[] = [];
    await tusUpload({ uploadUrl: 'https://x/up', file, chunkSize: 4096, fetchImpl: s.impl, retryDelays: [0], onProgress: sent => seen.push(sent) });
    expect(s.held()).toBe(file.size);
    expect(seen[seen.length - 1]).toBe(file.size);
  });

  it('carries on from the byte the server already has (resume after the app was closed)', async () => {
    const s = fakeServer();
    // The server already holds 4096 bytes from an earlier session.
    await s.impl('https://x/up', { method: 'PATCH', headers: { 'Upload-Offset': '0' }, body: file.slice(0, 4096) });
    s.log.length = 0;
    await tusUpload({ uploadUrl: 'https://x/up', file, chunkSize: 4096, fetchImpl: s.impl, retryDelays: [0] });
    expect(s.held()).toBe(file.size);
    expect(s.log.filter(l => l === 'PATCH@0')).toHaveLength(0); // never re-sends what it had
  });

  it('retries after a dropped connection without losing or repeating bytes', async () => {
    const s = fakeServer({ failPatchOnce: [4096] });
    await tusUpload({ uploadUrl: 'https://x/up', file, chunkSize: 4096, fetchImpl: s.impl, retryDelays: [0, 0, 0] });
    expect(s.held()).toBe(file.size);
  });

  it('reports an expired upload link so the caller can ask for a new one', async () => {
    const s = fakeServer({ expired: true });
    await expect(tusUpload({ uploadUrl: 'https://x/up', file, fetchImpl: s.impl, retryDelays: [0] })).rejects.toBeInstanceOf(TusExpiredError);
  });
});
