// Operator CLI (26.7). Usage inside the container:
//   node dist/cli.js remove-pin "<displayName>"
import { sameDisplayName } from '@hr/shared';
import { FileStore } from './storage/fileStore';

interface ProfileRecord {
  id: string;
  displayName: string;
  pin: unknown;
}

export async function removePin(dataDir: string, displayName: string): Promise<boolean> {
  const store = new FileStore(dataDir);
  const list = (await store.readJson<ProfileRecord[]>('profiles.json')) ?? [];
  const p = list.find((x) => sameDisplayName(x.displayName, displayName));
  if (!p) return false;
  p.pin = null;
  await store.writeJson('profiles.json', list);
  return true;
}

const [command, arg] = process.argv.slice(2);
if (command === 'remove-pin' && arg) {
  const ok = await removePin(process.env.DATA_DIR ?? './data', arg);
  console.log(ok ? `PIN removed for "${arg}".` : `No profile named "${arg}".`);
  process.exitCode = ok ? 0 : 1;
} else if (command) {
  console.log('Usage: node dist/cli.js remove-pin "<displayName>"');
  process.exitCode = 1;
}
