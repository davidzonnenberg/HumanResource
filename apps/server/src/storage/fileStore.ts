// JSON files on the Docker volume with atomic write-then-rename and a per-file async mutex.
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const locks = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    key,
    next.catch(() => undefined),
  );
  return next;
}

export class FileStore {
  constructor(readonly dir: string) {}

  path(...parts: string[]): string {
    return join(this.dir, ...parts);
  }

  async readJson<T>(rel: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(this.path(rel), 'utf8')) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async writeJson(rel: string, value: unknown): Promise<void> {
    const file = this.path(rel);
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(value), 'utf8');
    await rename(tmp, file); // atomic on the same filesystem
  }

  async remove(rel: string): Promise<void> {
    await rm(this.path(rel), { force: true });
  }

  /** Write/delete probe for the health endpoint (43.4). */
  async probe(): Promise<boolean> {
    try {
      await this.writeJson('.health-probe.json', { t: Date.now() });
      await this.remove('.health-probe.json');
      return true;
    } catch {
      return false;
    }
  }
}
