// Build-output checks for the PWA (task 17.4): after `vite build`, the manifest has the expected
// fields and icons, and the generated service worker precaches the entry, game and Rapier chunks
// and every file it lists exists on disk. Skipped when dist/ has not been built.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dist = join(__dirname, '..', 'dist');
const present = existsSync(join(dist, 'sw.js'));

interface WebManifest {
  name: string;
  display: string;
  orientation: string;
  icons: { src: string; sizes: string; purpose?: string }[];
}

/** URLs listed in the Workbox precache manifest: `precacheAndRoute([{url:"…",revision:…}, …])`. */
function precacheUrls(sw: string): string[] {
  return [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1] as string);
}

describe.skipIf(!present)('PWA build output', () => {
  it('manifest is a named, standalone, landscape app with 192, 512 and maskable icons', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) as WebManifest;
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('landscape');
    expect(manifest.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) expect(existsSync(join(dist, icon.src))).toBe(true);
  });

  it('precache lists the entry, game and Rapier chunks', () => {
    const urls = precacheUrls(readFileSync(join(dist, 'sw.js'), 'utf8'));
    expect(urls).toEqual(expect.arrayContaining(['index.html', 'manifest.webmanifest']));
    expect(urls.some((u) => /^assets\/index-.+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /^assets\/GameScreen-.+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /^assets\/ManualDriving-.+\.js$/.test(u))).toBe(true);
    expect(urls.some((u) => /^assets\/rapier-.+\.js$/.test(u))).toBe(true);
  });

  it('every precached URL exists in dist, so offline play cannot hit a missing file', () => {
    const urls = precacheUrls(readFileSync(join(dist, 'sw.js'), 'utf8'));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(existsSync(join(dist, u)), u).toBe(true);
  });
});
