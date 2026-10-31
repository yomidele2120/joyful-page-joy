// Saves unfinished work on the phone itself (IndexedDB), so it survives closing the browser, switching apps,
// the tab being thrown out of memory, or the phone restarting:
//   - the post being written (picked video or photos, caption, linked product) = a "draft"
//   - videos that are on their way to the server = "jobs", with how far they got
// IndexedDB can keep big files (a video is stored as a Blob). If it is not available (some private windows),
// everything still works for as long as the page stays open, using a plain in-memory copy.

const DB_NAME = 'ithub-uploads';
const DB_VERSION = 1;
type StoreName = 'jobs' | 'drafts' | 'files';

export type JobPhase = 'queued' | 'uploading' | 'processing' | 'failed';

export interface VideoJob {
  id: string;
  userId: string;
  vendorId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  poster?: string | null;
  caption: string;
  productId: string | null;
  /** Created by the server when the upload starts. */
  postId?: string;
  uploadUrl?: string;
  phase: JobPhase;
  /** 0..100, for the progress bar. */
  progress: number;
  /** What the seller is told. */
  message?: string;
  error?: string;
  /** True once the failure is final (the seller must act), as opposed to "waiting for signal". */
  fatal?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DraftItem {
  id: string;
  kind: 'image' | 'video';
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
  poster?: string | null;
  duration?: number;
}
export interface ComposerDraft {
  key: string;
  items: DraftItem[];
  caption: string;
  productId: string;
  savedAt: number;
}

const memory: Record<StoreName, Map<string, unknown>> = { jobs: new Map(), drafts: new Map(), files: new Map() };
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(resolve => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('jobs')) db.createObjectStore('jobs', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
        // The video file of a job, kept apart from the small job record so updating progress never rewrites it.
        if (!db.objectStoreNames.contains('files')) db.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function run<T>(store: StoreName, mode: IDBTransactionMode, make: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise<T | undefined>((resolve, reject) => {
    try {
      const tx = db.transaction(store, mode);
      const req = make(tx.objectStore(store));
      let result: T | undefined;
      req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error ?? new Error('Storage error'));
      tx.onabort = () => reject(tx.error ?? new Error('Storage is full'));
    } catch (err) {
      reject(err);
    }
  });
}

const keyOf = (store: StoreName, value: { id?: string; key?: string }) => (store === 'drafts' ? value.key! : value.id!);

async function put<T extends { id?: string; key?: string }>(store: StoreName, value: T): Promise<'disk' | 'memory'> {
  const db = await openDb();
  if (db) {
    await run(store, 'readwrite', s => s.put(value));
    memory[store].delete(keyOf(store, value));
    return 'disk';
  }
  memory[store].set(keyOf(store, value), value);
  return 'memory';
}

async function get<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return memory[store].get(key) as T | undefined;
  return (await run<T>(store, 'readonly', s => s.get(key) as IDBRequest<T>)) ?? (memory[store].get(key) as T | undefined);
}

async function all<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  if (!db) return [...memory[store].values()] as T[];
  const rows = (await run<T[]>(store, 'readonly', s => s.getAll() as IDBRequest<T[]>)) ?? [];
  return [...rows, ...([...memory[store].values()] as T[])];
}

async function remove(store: StoreName, key: string): Promise<void> {
  memory[store].delete(key);
  const db = await openDb();
  if (db) await run(store, 'readwrite', s => s.delete(key));
}

export const putJob = (job: VideoJob) => put('jobs', job);
export const getJob = (id: string) => get<VideoJob>('jobs', id);
export const getAllJobs = () => all<VideoJob>('jobs');
export const deleteJob = (id: string) => remove('jobs', id);

/** The video file for a job. Throws if the phone has no room, so the caller can fall back to keeping it in memory. */
export const putFile = (id: string, blob: Blob) => put('files', { id, blob });
export const getFile = async (id: string) => (await get<{ id: string; blob: Blob }>('files', id))?.blob;
export const deleteFile = (id: string) => remove('files', id);

export const putDraft = (draft: ComposerDraft) => put('drafts', draft);
export const getDraft = (key: string) => get<ComposerDraft>('drafts', key);
export const deleteDraft = (key: string) => remove('drafts', key);

/** Asks the browser not to throw this data away when the phone is short on space. Best effort. */
export async function requestPersistentStorage(): Promise<void> {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}

/** False when the phone clearly has no room to keep a copy of this file. */
export async function hasRoomFor(bytes: number): Promise<boolean> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est?.quota || est.usage === undefined) return true;
    return est.quota - est.usage > bytes * 1.2;
  } catch {
    return true;
  }
}
