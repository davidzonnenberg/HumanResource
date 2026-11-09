// Local_Store (23.5, 23.6): IndexedDB via idb, with a localStorage fallback behind one interface.
import { openDB, type IDBPDatabase } from 'idb';

export type StoreName = 'saves' | 'backups' | 'profiles' | 'slots' | 'meta' | 'syncQueue';
const STORES: StoreName[] = ['saves', 'backups', 'profiles', 'slots', 'meta', 'syncQueue'];

export interface KeyValueStore {
  readonly kind: 'indexeddb' | 'localstorage' | 'memory';
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  /** All values whose key starts with `prefix`. */
  list<T>(store: StoreName, prefix?: string): Promise<T[]>;
}

export async function idbStore(name = 'human-resource'): Promise<KeyValueStore> {
  const db: IDBPDatabase = await openDB(name, 1, {
    upgrade(d) {
      for (const s of STORES) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
    },
  });
  // Test transaction: private modes may open but refuse writes.
  await db.put('meta', Date.now(), '__probe');
  return {
    kind: 'indexeddb',
    get: async (s, k) => (await db.get(s, k)) as never,
    put: async (s, k, v) => void (await db.put(s, v, k)),
    delete: async (s, k) => db.delete(s, k),
    async list<T>(s: StoreName, prefix = ''): Promise<T[]> {
      const keys = (await db.getAllKeys(s)).map(String).filter((k) => k.startsWith(prefix) && k !== '__probe');
      const out: T[] = [];
      for (const k of keys) out.push((await db.get(s, k)) as T);
      return out;
    },
  };
}

export function lsStore(storage: Storage = window.localStorage): KeyValueStore {
  const key = (s: StoreName, k: string) => `hr:${s}:${k}`;
  return {
    kind: 'localstorage',
    get: async <T,>(s: StoreName, k: string) => {
      const raw = storage.getItem(key(s, k));
      return raw === null ? undefined : (JSON.parse(raw) as T);
    },
    put: async (s, k, v) => storage.setItem(key(s, k), JSON.stringify(v)),
    delete: async (s, k) => storage.removeItem(key(s, k)),
    async list<T>(s: StoreName, prefix = ''): Promise<T[]> {
      const out: T[] = [];
      const p = key(s, prefix);
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(p)) out.push(JSON.parse(storage.getItem(k) ?? 'null') as T);
      }
      return out;
    },
  };
}

export function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  const key = (s: StoreName, k: string) => `${s}:${k}`;
  return {
    kind: 'memory',
    get: async (s, k) => structuredClone(data.get(key(s, k))) as never,
    put: async (s, k, v) => void data.set(key(s, k), structuredClone(v)),
    delete: async (s, k) => void data.delete(key(s, k)),
    async list<T>(s: StoreName, prefix = ''): Promise<T[]> {
      return [...data.entries()].filter(([k]) => k.startsWith(key(s, prefix))).map(([, v]) => structuredClone(v) as T);
    },
  };
}

export interface OpenedStore {
  store: KeyValueStore;
  /** True the first time the localStorage fallback is used on this device (23.6). */
  showFallbackWarning: boolean;
}

export async function openLocalStore(): Promise<OpenedStore> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    return { store: await idbStore(), showFallbackWarning: false };
  } catch {
    const store = lsStore();
    const warned = await store.get<boolean>('meta', 'fallbackWarned');
    if (!warned) await store.put('meta', 'fallbackWarned', true);
    return { store, showFallbackWarning: !warned };
  }
}
