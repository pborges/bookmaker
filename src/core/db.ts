// IndexedDB wrapper for imported PDF bytes and generated thumbnails.
// Notebook/item metadata lives in localStorage (see persistence.ts); the
// heavy binary data lives here.

const DB_NAME = "bookmaker";
const DB_VERSION = 1;
const PDF_STORE = "pdfs";
const THUMB_STORE = "thumbnails";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE);
      }
      if (!db.objectStoreNames.contains(THUMB_STORE)) {
        db.createObjectStore(THUMB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function put(store: string, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function get<T>(store: string, key: string): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const request = tx.objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function del(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function putPdfBytes(sourceId: string, bytes: ArrayBuffer): Promise<void> {
  return put(PDF_STORE, sourceId, bytes);
}

export function getPdfBytes(sourceId: string): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>(PDF_STORE, sourceId);
}

export function deletePdfBytes(sourceId: string): Promise<void> {
  return del(PDF_STORE, sourceId);
}

export function putThumbnail(key: string, blob: Blob): Promise<void> {
  return put(THUMB_STORE, key, blob);
}

export function getThumbnail(key: string): Promise<Blob | undefined> {
  return get<Blob>(THUMB_STORE, key);
}

export function thumbnailKey(sourceId: string, pageIndex: number): string {
  return `${sourceId}:${pageIndex}`;
}
