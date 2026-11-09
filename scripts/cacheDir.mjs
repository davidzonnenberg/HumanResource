// Resolves the cache base folder outside OneDrive (see docs/onedrive.md).
// Override with the HR_CACHE_DIR environment variable.
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function cacheBase() {
  return process.env.HR_CACHE_DIR ?? join(tmpdir(), 'human-resource');
}

export function cacheDir(name) {
  return join(cacheBase(), name);
}
