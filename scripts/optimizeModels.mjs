// Shrinks raw GLBs (ComfyUI / Trellis exports) into game-ready GLBs.
//
//   raw (never touched):  assets-src/models-raw/*.glb
//   output (game uses):   apps/web/public/models/*.glb
//
// Safe to re-run: the RAW file is always the input, so triangles are never lost twice.
// A model is only (re)built when it is new or the raw file changed. Use --force to redo all.
//
//   npm run models:optimize
//   npm run models:optimize -- --ratio=0.05      (keep 5% of triangles, smaller/blockier)
//   npm run models:optimize -- --force           (rebuild everything)
//   npm run models:optimize -- --texture=256     (max texture size in px, default 1024)
//   npm run models:optimize -- --error=0.0005    (tighter = less distortion, more triangles)
//   npm run models:optimize -- --lock-border=false
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const rawDir = join(root, 'assets-src', 'models-raw');
const outDir = join(root, 'apps', 'web', 'public', 'models');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const force = args.includes('--force');
// Default 1 = do NOT cut triangles here. Cutting after the texture bake smears colors and opens holes;
// reduce triangles in ComfyUI (Decimate Mesh) instead, where the texture is baked afterwards.
const ratio = Number(flag('ratio', '1'));
const texture = Number(flag('texture', '1024'));
const error = Number(flag('error', '0.001'));
// Locking borders keeps UV seams intact, which stops smeared/streaky colors. --lock-border=false to disable.
const lockBorder = flag('lock-border', 'true') !== 'false';
const CLI = '@gltf-transform/cli@4.5.1';

if (!(ratio > 0 && ratio <= 1) || !(texture > 0) || !(error > 0)) {
  console.error('Invalid --ratio (0-1), --texture (pixels) or --error (>0).');
  process.exit(1);
}

mkdirSync(rawDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const kb = (p) => `${Math.round(statSync(p).size / 1024)} KB`;
const files = readdirSync(rawDir).filter((f) => f.toLowerCase().endsWith('.glb'));
if (files.length === 0) {
  console.log(`No .glb files in ${rawDir}. Put raw exports there first.`);
  process.exit(0);
}

let built = 0;
let skipped = 0;
let failed = 0;
for (const f of files) {
  const input = join(rawDir, f);
  const output = join(outDir, f);
  if (!force && existsSync(output) && statSync(output).mtimeMs >= statSync(input).mtimeMs) {
    console.log(`skip   ${f} (already optimized, raw unchanged)`);
    skipped++;
    continue;
  }
  const cmd =
    `npx --yes ${CLI} optimize "${input}" "${output}" ` +
    `--compress meshopt --simplify true --simplify-ratio ${ratio} --simplify-error ${error} ` +
    `--simplify-lock-border ${lockBorder} ` +
    `--texture-compress webp --texture-size ${texture}`;
  try {
    console.log(`build  ${f} ...`);
    execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] });
    console.log(`       ${kb(input)} -> ${kb(output)}`);
    built++;
  } catch {
    console.error(`FAILED ${f}`);
    failed++;
  }
}
console.log(`Done. built ${built}, skipped ${skipped}, failed ${failed}. Output: ${outDir}`);
process.exit(failed ? 1 : 0);
