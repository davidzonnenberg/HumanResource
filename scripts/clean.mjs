// Cross-platform clean: removes build output folders and the out-of-OneDrive cache.
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { cacheBase } from './cacheDir.mjs';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const targets = ['apps/web/dist', 'apps/web/dev-dist', 'apps/server/dist', 'coverage'];
for (const t of targets) rmSync(join(root, t), { recursive: true, force: true });
rmSync(cacheBase(), { recursive: true, force: true });
console.log('Cleaned build output and cache at', cacheBase());
