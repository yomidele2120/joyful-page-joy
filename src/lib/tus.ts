// A small resumable-upload client for the tus protocol (what Cloudflare Stream uses for big videos).
//
// The upload URL already exists (our server asked Cloudflare for it). This asks "how many bytes do you have?"
// (HEAD) and sends the rest in chunks (PATCH). Because the server remembers the offset, an upload that was cut
// off by a lost connection, a closed tab or a dead phone carries on from where it stopped.

export class TusExpiredError extends Error {
  constructor() { super('The upload link has expired'); this.name = 'TusExpiredError'; }
}
/** The connection kept failing. The upload is safe on the server side up to this point and can be resumed later. */
export class TusNetworkError extends Error {
  constructor() { super('The connection kept dropping. Your video is saved and will carry on when the signal is better.'); this.name = 'TusNetworkError'; }
}
export class TusAbortedError extends Error {
  constructor() { super('Upload paused'); this.name = 'TusAbortedError'; }
}

export interface TusOptions {
  uploadUrl: string;
  file: Blob;
  /** Must be a multiple of 256 KiB, and at least 5 MiB except for the last piece (Cloudflare's rule). */
  chunkSize?: number;
  onProgress?: (sent: number, total: number) => void;
  signal?: AbortSignal;
  /** Wait times (ms) between retries of one step. Tests pass short ones. */
  retryDelays?: number[];
  fetchImpl?: typeof fetch;
}

export const DEFAULT_CHUNK = 8 * 1024 * 1024;
const DEFAULT_RETRY_DELAYS = [0, 1000, 3000, 5000, 10000, 20000];
const TUS = { 'Tus-Resumable': '1.0.0' };

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new TusAbortedError());
    const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new TusAbortedError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

// Do not burn retries while the phone has no signal: wait until it is back online.
function waitUntilOnline(signal?: AbortSignal): Promise<void> {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => { window.removeEventListener('online', onOnline); signal?.removeEventListener('abort', onAbort); };
    const onOnline = () => { done(); resolve(); };
    const onAbort = () => { done(); reject(new TusAbortedError()); };
    window.addEventListener('online', onOnline, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class RetryableError extends Error {}

/** Uploads `file` to a tus URL, resuming from whatever the server already has. Resolves when every byte is stored. */
export async function tusUpload(opts: TusOptions): Promise<void> {
  const { uploadUrl, file, signal, onProgress } = opts;
  const chunk = opts.chunkSize ?? DEFAULT_CHUNK;
  const delays = opts.retryDelays ?? DEFAULT_RETRY_DELAYS;
  const doFetch = opts.fetchImpl ?? fetch.bind(globalThis);
  const total = file.size;

  const askOffset = async (): Promise<number> => {
    let res: Response;
    try {
      res = await doFetch(uploadUrl, { method: 'HEAD', headers: TUS, signal });
    } catch (err) {
      if (signal?.aborted) throw new TusAbortedError();
      throw new RetryableError((err as Error).message);
    }
    if (res.status === 404 || res.status === 410 || res.status === 403) throw new TusExpiredError();
    if (!res.ok) {
      if (res.status >= 500 || res.status === 429 || res.status === 408) throw new RetryableError(`HTTP ${res.status}`);
      throw new Error(`The upload could not be resumed (HTTP ${res.status}).`);
    }
    const offset = Number(res.headers.get('Upload-Offset'));
    if (!Number.isFinite(offset) || offset < 0) throw new RetryableError('No upload offset');
    return offset;
  };

  const sendFrom = async (offset: number): Promise<number> => {
    const end = Math.min(offset + chunk, total);
    let res: Response;
    try {
      res = await doFetch(uploadUrl, {
        method: 'PATCH',
        headers: { ...TUS, 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
        body: file.slice(offset, end),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) throw new TusAbortedError();
      throw new RetryableError((err as Error).message);
    }
    if (res.status === 404 || res.status === 410) throw new TusExpiredError();
    // 409: the server is at a different offset than we thought. Ask again.
    if (res.status === 409 || res.status >= 500 || res.status === 429 || res.status === 408) throw new RetryableError(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`The upload was rejected (HTTP ${res.status}).`);
    const next = Number(res.headers.get('Upload-Offset'));
    return Number.isFinite(next) && next > offset ? next : end;
  };

  // Retries only for problems that can go away by themselves (network, busy server). Each retry first asks the
  // server how much it really has, so nothing is sent twice or skipped.
  let failures = 0;
  let offset = -1;
  for (;;) {
    try {
      if (signal?.aborted) throw new TusAbortedError();
      if (offset < 0) offset = await askOffset();
      onProgress?.(offset, total);
      if (offset >= total) return;
      offset = await sendFrom(offset);
      failures = 0; // a piece went through: the connection is fine
      onProgress?.(Math.min(offset, total), total);
    } catch (err) {
      if (!(err instanceof RetryableError)) throw err;
      offset = -1;
      await waitUntilOnline(signal);
      failures += 1;
      if (failures > delays.length) throw new TusNetworkError();
      await sleep(delays[failures - 1], signal);
    }
  }
}
