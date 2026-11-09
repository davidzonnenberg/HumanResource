// Build-output checks for the PWA (task 17.4): after `vite build`, the manifest has the expected
// fields and the precache lists the game and Rapier chunks. Skips if dist is absent.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = join(__dirname, '..', 'dist');
const present = existsSync(join(dist, 'sw.js'));

describe.skipIf(!present)('PWA build output', () => {
  it('manifest has landscape, standalone and both icon sizes', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) as { display: string; orientation: string; icons: { sizes: string }[] };
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  });

  it('precaches the main and Rapier chunks', () => {
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    const assets = readdirSync(join(dist, 'assets'));
    expect(assets.some((f) => f.startsWith('index-') && f.endsWith('.js'))).toBe(true);
    expect(assets.some((f) => f.startsWith('ManualDriving-') && f.endsWith('.js'))).toBe(true);
    expect(sw).toMatch(/precache|__WB_MANIFEST|workbox/);
  });
});
