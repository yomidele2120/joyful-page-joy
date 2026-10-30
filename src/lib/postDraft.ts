import type { PickedMedia } from '@/components/media/MediaPicker';

interface StoredMedia {
  id: string;
  uploadId: string;
  file: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
  kind: PickedMedia['kind'];
  preview: string;
  duration?: number;
}

interface StoredPostDraft {
  vendorId: string;
  media: StoredMedia[];
  caption: string;
  productId: string;
}

export interface PostDraft {
  media: PickedMedia[];
  caption: string;
  productId: string;
}

const DATABASE_NAME = 'vendor-post-drafts';
const DATABASE_VERSION = 1;
const STORE_NAME = 'drafts';

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support saving post drafts'));
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'vendorId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        databasePromise = undefined;
        reject(request.error ?? new Error('Could not open saved post drafts'));
      };
      request.onblocked = () => {
        databasePromise = undefined;
        reject(new Error('Saved post drafts are blocked by another browser tab'));
      };
    });
  }

  return databasePromise;
}

function completeTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the post draft'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving the post draft was interrupted'));
  });
}

export async function loadPostDraft(vendorId: string): Promise<PostDraft | null> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readonly');
  const request = transaction.objectStore(STORE_NAME).get(vendorId) as IDBRequest<StoredPostDraft | undefined>;
  const stored = await new Promise<StoredPostDraft | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not read the saved post draft'));
  });
  if (!stored) return null;

  return {
    caption: stored.caption,
    productId: stored.productId,
    media: stored.media.map((item) => {
      const file = new File([item.file], item.fileName, {
        type: item.fileType,
        lastModified: item.lastModified,
      });
      return {
        id: item.id,
        uploadId: item.uploadId || crypto.randomUUID(),
        file,
        kind: item.kind,
        preview: item.preview || (item.kind === 'image' ? URL.createObjectURL(file) : ''),
        duration: item.duration,
      };
    }),
  };
}

export async function savePostDraft(vendorId: string, draft: PostDraft): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const completion = completeTransaction(transaction);
  const stored: StoredPostDraft = {
    vendorId,
    caption: draft.caption,
    productId: draft.productId,
    media: draft.media.map((item) => ({
      id: item.id,
      uploadId: item.uploadId,
      file: item.file,
      fileName: item.file.name,
      fileType: item.file.type,
      lastModified: item.file.lastModified,
      kind: item.kind,
      preview: item.preview.startsWith('data:') ? item.preview : '',
      duration: item.duration,
    })),
  };
  transaction.objectStore(STORE_NAME).put(stored);
  await completion;
}

export async function clearPostDraft(vendorId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const completion = completeTransaction(transaction);
  transaction.objectStore(STORE_NAME).delete(vendorId);
  await completion;
}
