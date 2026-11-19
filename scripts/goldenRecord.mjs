// Re-records the golden playthrough on purpose (task 38.4): `npm run golden:record`.
// Run it only after a deliberate balance or random-number-order change, and commit the new file.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vitest = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));
const res = spawnSync(process.execPath, [vitest, 'run', 'packages/sim/test/golden'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GOLDEN_RECORD: '1' },
});
process.exit(res.status ?? 1);