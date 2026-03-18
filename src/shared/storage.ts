// ============================================================
// IndexedDB Persistence for Annotations
// ============================================================

import type { AnnotationSession, RAFAnnotation } from "./raf-schema";

const DB_NAME = "renderdraw_lens";
const DB_VERSION = 1;
const SESSIONS_STORE = "sessions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("url", "url", { unique: false });
        store.createIndex("updated_at", "updated_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getSession(id: string): Promise<AnnotationSession | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const req = tx.objectStore(SESSIONS_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function getSessionByUrl(url: string): Promise<AnnotationSession | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const idx = tx.objectStore(SESSIONS_STORE).index("url");
    const req = idx.getAll(url);
    req.onsuccess = () => {
      const sessions = req.result as AnnotationSession[];
      // Return most recently updated
      sessions.sort((a, b) => b.updated_at - a.updated_at);
      resolve(sessions[0]);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(session: AnnotationSession): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    tx.objectStore(SESSIONS_STORE).put(session);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllSessions(): Promise<AnnotationSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const req = tx.objectStore(SESSIONS_STORE).getAll();
    req.onsuccess = () => {
      const sessions = req.result as AnnotationSession[];
      sessions.sort((a, b) => b.updated_at - a.updated_at);
      resolve(sessions);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SESSIONS_STORE, "readwrite");
    tx.objectStore(SESSIONS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingAnnotations(): Promise<RAFAnnotation[]> {
  const sessions = await getAllSessions();
  const pending: RAFAnnotation[] = [];
  for (const session of sessions) {
    for (const ann of session.annotations) {
      if (ann.status === "pending") {
        pending.push(ann);
      }
    }
  }
  return pending;
}

// LRU eviction: remove sessions older than 30 days
export async function evictStaleSessions(): Promise<number> {
  const sessions = await getAllSessions();
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  let evicted = 0;
  for (const session of sessions) {
    if (session.updated_at < cutoff) {
      await deleteSession(session.id);
      evicted++;
    }
  }
  return evicted;
}
