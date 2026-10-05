/** Saved texts, in IndexedDB: books are too big for localStorage's ~5 MB.
 * Metadata and full text live in separate stores so listing the library
 * never loads every book's text. */

export type DocMeta = {
  id: string;
  title: string;
  wordCount: number;
  /** Word index to resume from. */
  pos: number;
  source?: string;
  createdAt: number;
  updatedAt: number;
};

const DB_NAME = "speed-reader";
const META = "meta";
const TEXT = "text";
const CURRENT_KEY = "speed-reader:current";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(META, { keyPath: "id" });
      req.result.createObjectStore(TEXT);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export async function listDocs(): Promise<DocMeta[]> {
  const all = await run<DocMeta[]>(META, "readonly", (s) => s.getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getText = (id: string) => run<string | undefined>(TEXT, "readonly", (s) => s.get(id));
export const getMeta = (id: string) => run<DocMeta | undefined>(META, "readonly", (s) => s.get(id));

export async function addDoc(title: string, text: string, source?: string): Promise<DocMeta> {
  const now = Date.now();
  const meta: DocMeta = {
    id: crypto.randomUUID(),
    title: title.trim() || deriveTitle(text),
    wordCount: countWords(text),
    pos: 0,
    source,
    createdAt: now,
    updatedAt: now,
  };
  await run(TEXT, "readwrite", (s) => s.put(text, meta.id));
  await run(META, "readwrite", (s) => s.put(meta));
  return meta;
}

export async function savePos(id: string, pos: number) {
  const meta = await getMeta(id);
  if (meta) await run(META, "readwrite", (s) => s.put({ ...meta, pos, updatedAt: Date.now() }));
}

export async function renameDoc(id: string, title: string) {
  const meta = await getMeta(id);
  if (meta && title.trim()) await run(META, "readwrite", (s) => s.put({ ...meta, title: title.trim() }));
}

export async function deleteDoc(id: string) {
  await run(META, "readwrite", (s) => s.delete(id));
  await run(TEXT, "readwrite", (s) => s.delete(id));
}

export function deriveTitle(text: string): string {
  const first = text.trim().split(/\n/)[0].trim();
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first || "Untitled";
}

export function getCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function setCurrentId(id: string) {
  try {
    localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* storage unavailable: the reader just opens the newest text next time */
  }
}

let migration: Promise<void> | null = null;

/** One-time move of the old single-text localStorage slot into the library.
 * Memoised and the old keys cleared before the async write, so a second
 * caller (e.g. React running effects twice in dev) can't add a duplicate. */
export function migrateLegacy(): Promise<void> {
  migration ??= (async () => {
    try {
      const text = localStorage.getItem("speed-reader:text");
      if (!text) return;
      const pos = Number(localStorage.getItem("speed-reader:pos")) || 0;
      localStorage.removeItem("speed-reader:text");
      localStorage.removeItem("speed-reader:pos");
      const meta = await addDoc("", text);
      await savePos(meta.id, pos);
      setCurrentId(meta.id);
    } catch {
      /* nothing to migrate */
    }
  })();
  return migration;
}
