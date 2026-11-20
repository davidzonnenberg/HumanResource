// 2D town preview UI (T2): draws a generated town on a canvas, click a building for its stable id, download the baked
// JSON, load another brief. Dev tool only; it runs the real generator from this folder (see previewModel.ts).
import { CHUNK_SIZE } from '../chunkTown';
import { offsetLine } from '../geom';
import { parseTownBrief } from '../townSchema';
import type { Building, Road, TownBrief, TownOverrides, Vec2 } from '../townTypes';
import { buildPreview, nextSeed, type PreviewResult } from './previewModel';

const SCALE = 2; // canvas pixels per metre

const ZONE_COLOURS: Record<string, string> = {
  core: '#d8c8ab', west_inner: '#bfd08c', west_outer: '#bccd80', rich_inner: '#a9d878', rich_outer: '#9bd667',
  business_inner: '#c3c9a4', business_outer: '#c6c9b0',
};

export const PREVIEW_CSS = `#tm-root{--bg:#fff;--fg:#1c1b1f;--mut:#5f5b66;--bd:#d9d4e0;--acc:#d9480f;font-family:system-ui,sans-serif;color:var(--fg);background:var(--bg);border-radius:12px;padding:12px;box-sizing:border-box;max-width:100%}
@media (prefers-color-scheme:dark){#tm-root{--bg:#1b1a20;--fg:#ece9f1;--mut:#a7a2b3;--bd:#3a3742;--acc:#ff8a3d}}
#tm-root form{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin:0 0 8px}
#tm-root label{font-size:13px;color:var(--mut);display:flex;flex-direction:column;gap:2px}
#tm-root input[type=text]{width:130px;min-height:44px;box-sizing:border-box;padding:0 10px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);font-size:15px}
#tm-root button{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--fg);cursor:pointer;font-size:14px}
#tm-root button.pri{background:var(--acc);border-color:var(--acc);color:#fff}
#tm-root button:focus-visible,#tm-root input:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
#tm-root label.chk{flex-direction:row;align-items:center;gap:6px;min-height:44px;color:var(--fg);font-size:14px}
#tm-root .wrap{overflow:auto;max-height:680px;border-radius:10px;border:1px solid var(--bd)}
#tm-root canvas{display:block;width:100%;height:auto;cursor:crosshair}
#tm-root .wrap.z2 canvas{width:200%}
#tm-root .wrap.z3 canvas{width:300%}
#tm-root .st,#tm-root .info{font-size:13px;margin:6px 0 0;min-height:1.2em}
#tm-root .info{color:var(--mut)}`;

const PICK_HINT = 'Click a building to see its stable id (use it in town-overrides.json).';

const TEMPLATE = `<form>
<label for='tm-seed'>Seed<input id='tm-seed' type='text'></label>
<button type='submit' class='pri'>Generate</button>
<button type='button' class='b-new'>Next seed</button>
<button type='button' class='b-zoom'>Zoom 1×</button>
<label class='chk'><input type='checkbox' class='b-chk'>Show chunks</label>
<button type='button' class='b-dl'>Download baked JSON</button>
<label>Load brief<input type='file' class='b-brief' accept='.json,application/json'></label>
</form>
<div class='wrap'><canvas aria-label='Procedural town map'></canvas></div>
<p class='st' aria-live='polite'></p>
<p class='info' aria-live='polite'></p>`;

function roadColour(r: Road): string {
  if (r.kind === 'lane' || r.kind === 'gate') return '#a8553a';
  if (r.kind === 'quay') return '#9c5a40';
  if (r.kind === 'singel') return '#6a6e78';
  if (r.kind === 'ring' || r.kind === 'radial' || r.kind === 'ramp') return '#5b5f6a';
  return r.surface === 'klinkers' ? '#b06a4f' : r.surface === 'concrete' ? '#55595f' : '#73777f';
}

/**
 * Mount the preview in `root` (an element with id "tm-root", the CSS is scoped to it).
 * `overrides` and `locked` are used only while the seed is the brief's own seed: the ids of another seed would not match.
 */
export function mountTownPreview(root: HTMLElement, initial: { brief: TownBrief; overrides: TownOverrides; locked: Building[] }): void {
  root.innerHTML = TEMPLATE;
  const q = <T extends Element>(sel: string): T => root.querySelector<T>(sel)!;
  const cv = q<HTMLCanvasElement>('canvas');
  const ctx = cv.getContext('2d')!;
  const seedIn = q<HTMLInputElement>('#tm-seed');
  const st = q<HTMLElement>('.st');
  const info = q<HTMLElement>('.info');
  const wrap = q<HTMLElement>('.wrap');
  const zoomBtn = q<HTMLButtonElement>('.b-zoom');
  const form = q<HTMLFormElement>('form');
  const chunkChk = q<HTMLInputElement>('.b-chk');

  let brief = initial.brief;
  let G: PreviewResult | null = null;
  let zoom = 1;
  let sel: PreviewResult['shown']['buildings'][number] | null = null;
  let W0 = brief.size[0], H0 = brief.size[1];
  seedIn.value = brief.seed;
  info.textContent = PICK_HINT;

  function resize() {
    W0 = brief.size[0]; H0 = brief.size[1];
    cv.width = W0 * SCALE; cv.height = H0 * SCALE;
  }

  function path(p: Vec2[], w: number, col: string, dash: number[] = []) {
    if (p.length < 2) return;
    ctx.beginPath(); ctx.moveTo(p[0]![0], p[0]![1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i]![0], p[i]![1]);
    ctx.lineWidth = w; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
  }

  function rrect(x: number, y: number, a: number, l: number, w: number, fill: string, stroke: string) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = fill; ctx.fillRect(-l / 2, -w / 2, l, w);
    ctx.strokeStyle = stroke; ctx.lineWidth = 0.8; ctx.strokeRect(-l / 2, -w / 2, l, w);
    ctx.restore();
  }

  function circ(x: number, y: number, r: number, fill?: string, stroke?: string, lw = 1) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }

  /** Water drawn in runs of equal width (the river is wider outside the singel). */
  function waterRuns(points: Vec2[], widths: number[]): Array<[Vec2[], number]> {
    const runs: Array<[Vec2[], number]> = [];
    let cur: Vec2[] = [points[0]!];
    let cw = widths[0]!;
    for (let i = 1; i < points.length; i++) {
      if (widths[i] !== cw) {
        cur.push(points[i]!);
        runs.push([cur, cw]);
        cur = [points[i]!];
        cw = widths[i]!;
      } else cur.push(points[i]!);
    }
    runs.push([cur, cw]);
    return runs;
  }

  function draw(res: PreviewResult) {
    const g = res.shown;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = '#a5d36f'; ctx.fillRect(0, 0, W0, H0);

    const zg = g.zoneGrid;
    for (let gy = 0; gy < zg.rows; gy++) {
      let gx = 0;
      while (gx < zg.cols) {
        const z = zg.data[gy * zg.cols + gx]!;
        let e = gx + 1;
        while (e < zg.cols && zg.data[gy * zg.cols + e] === z) e++;
        ctx.fillStyle = ZONE_COLOURS[zg.zones[z]!] ?? '#a5d36f';
        ctx.fillRect(gx * zg.cell, gy * zg.cell, (e - gx) * zg.cell + 0.5, zg.cell + 0.5);
        gx = e;
      }
    }

    for (const p of g.parks) {
      ctx.beginPath(); p.outline.forEach((c, i) => (i ? ctx.lineTo(c[0], c[1]) : ctx.moveTo(c[0], c[1]))); ctx.closePath();
      ctx.fillStyle = '#78c055'; ctx.fill(); ctx.strokeStyle = '#5e9e45'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath();
      p.outline.forEach((c, i) => {
        const x = p.centre[0] + (c[0] - p.centre[0]) * 0.72, y = p.centre[1] + (c[1] - p.centre[1]) * 0.72;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath(); ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(245,235,205,0.95)'; ctx.lineWidth = 1.3; ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.ellipse(p.pond.x, p.pond.z, p.pond.rx, p.pond.rz, p.pond.angle, 0, Math.PI * 2); ctx.fillStyle = '#4aa3df'; ctx.fill();
    }

    for (const w of g.water) for (const [p, ww] of waterRuns(w.points, w.widths)) path(p, ww + 4, ww < 20 ? '#8c7b6b' : '#3f86c0');
    for (const w of g.water) for (const [p, ww] of waterRuns(w.points, w.widths)) path(p, ww, '#4aa3df');

    for (const r of g.roads) path(r.points, r.width + 3, r.surface === 'klinkers' ? '#cdb99a' : '#d8cdb9');
    for (const c of g.culDeSacs) circ(c[0], c[1], 7.5, '#d8cdb9');
    for (const b of g.bridges) if (b.over !== 'highway') rrect(b.x, b.z, b.angle, b.length, b.width, '#d9c7a6', '#6b5a48');
    for (const r of g.roads) if (r.kind !== 'radial' && r.kind !== 'ramp') path(r.points, r.width, roadColour(r));
    for (const c of g.culDeSacs) circ(c[0], c[1], 6, '#b06a4f');

    const hw = g.highway.points, hwW = g.highway.width;
    path(hw, hwW + 4, '#c8c3b8'); path(hw, hwW, '#4a4e57'); path(hw, 1.4, '#8d939b');
    path(offsetLine(hw, hwW / 4), 0.7, 'rgba(255,255,255,0.85)', [6, 6]);
    path(offsetLine(hw, -hwW / 4), 0.7, 'rgba(255,255,255,0.85)', [6, 6]);
    for (const b of g.bridges) if (b.over === 'highway') rrect(b.x, b.z, b.angle, b.length, b.width, '#d6d2c8', '#5f5a52');
    for (const r of g.roads) if (r.kind === 'ramp') path(r.points, r.width, '#5b5f6a');
    for (const r of g.roads) {
      if (r.kind === 'radial') { path(r.points, r.width, '#5b5f6a'); path(r.points, 0.6, 'rgba(255,255,255,0.6)', [4, 5]); }
      if (r.kind === 'ring') path(r.points, 0.6, 'rgba(255,255,255,0.6)', [4, 5]);
    }
    for (const b of g.roundabouts) { circ(b[0], b[1], 11.5, '#d8cdb9'); circ(b[0], b[1], 10, '#5b5f6a'); circ(b[0], b[1], 4.5, '#7cc25a', '#ffffff', 0.6); }

    const pl = g.plaza;
    rrect(pl[0], pl[1], 0, 28, 24, '#ddd0b6', '#a8987c');
    rrect(pl[0] - 4, pl[1], 0, 15, 8, '#6b5a4e', '#3d2a20');
    rrect(pl[0] + 8, pl[1], 0, 7, 7, '#4b3a30', '#2d1f18');

    for (const h of g.buildings) {
      ctx.save(); ctx.translate(h.x, h.z); ctx.rotate(h.angle);
      if (h.kind === 'office' || h.kind === 'flat' || h.kind === 'tower' || h.kind === 'landmark') {
        const o = h.kind === 'tower' ? 4 : 1.5;
        ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(-h.width / 2 + o, -h.depth / 2 + o, h.width, h.depth);
      }
      ctx.fillStyle = h.colour; ctx.fillRect(-h.width / 2, -h.depth / 2, h.width, h.depth);
      ctx.strokeStyle = h.locked ? '#ffd43b' : 'rgba(0,0,0,0.35)'; ctx.lineWidth = h.locked ? 1.6 : 0.5;
      ctx.strokeRect(-h.width / 2, -h.depth / 2, h.width, h.depth);
      ctx.beginPath();
      if (h.kind === 'office' || h.kind === 'tower') { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-h.width / 4, -h.depth / 4, h.width / 2, h.depth / 2); }
      else if (h.kind === 'warehouse') for (let u = -h.width / 2 + 4; u < h.width / 2; u += 4) { ctx.moveTo(u, -h.depth / 2); ctx.lineTo(u, h.depth / 2); }
      else if (h.kind === 'flat' || h.kind === 'villa') { ctx.moveTo(-h.width / 2, 0); ctx.lineTo(h.width / 2, 0); }
      else { ctx.moveTo(0, -h.depth / 2); ctx.lineTo(0, h.depth / 2); }
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.7; ctx.stroke();
      ctx.restore();
    }

    for (const t of g.trees) {
      circ(t[0] + 0.6, t[1] + 0.8, t[2], 'rgba(0,0,0,0.15)');
      circ(t[0], t[1], t[2], '#4f9a3a');
      circ(t[0] - t[2] * 0.3, t[1] - t[2] * 0.3, t[2] * 0.45, '#6fbf4f');
    }

    for (const s of g.signs) {
      const x = s.x, y = s.z;
      if (s.kind === 'yield') {
        ctx.beginPath(); ctx.moveTo(x - 3.5, y - 2.5); ctx.lineTo(x + 3.5, y - 2.5); ctx.lineTo(x, y + 3.5); ctx.closePath();
        ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#d62828'; ctx.lineWidth = 1; ctx.stroke();
      } else if (s.kind === 'speed30') {
        circ(x, y, 3.6, '#fff', '#d62828', 1.1);
        ctx.fillStyle = '#111'; ctx.font = 'bold 3.6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('30', x, y + 0.2);
      } else if (s.kind === 'centre') {
        circ(x, y, 3.6, '#fff', '#1f5fbf', 1.1); circ(x, y, 1.3, '#1f5fbf');
      } else {
        ctx.fillStyle = '#1f5fbf'; ctx.fillRect(x - 4, y - 2.5, 8, 5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6; ctx.strokeRect(x - 4, y - 2.5, 8, 5);
      }
    }

    if (chunkChk.checked) {
      const CH = CHUNK_SIZE;
      ctx.strokeStyle = 'rgba(30,30,70,0.6)'; ctx.lineWidth = 1.4; ctx.setLineDash([8, 6]);
      for (let x = CH; x < W0; x += CH) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H0); ctx.stroke(); }
      for (let y = CH; y < H0; y += CH) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W0, y); ctx.stroke(); }
      ctx.setLineDash([]);
      const cnt = new Map<string, number>();
      for (const h of g.buildings) {
        const k = `${Math.floor(h.x / CH)},${Math.floor(h.z / CH)}`;
        cnt.set(k, (cnt.get(k) ?? 0) + 1);
      }
      ctx.font = 'bold 12px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      for (const [k, n] of cnt) {
        const a = k.split(',').map(Number) as [number, number];
        const x = a[0] * CH + 6, y = a[1] * CH + 6, t = `chunk ${a[0]},${a[1]}: ${n}`;
        const w = ctx.measureText(t).width;
        ctx.fillStyle = 'rgba(20,20,50,0.75)'; ctx.fillRect(x - 3, y - 3, w + 6, 18);
        ctx.fillStyle = '#fff'; ctx.fillText(t, x, y);
      }
    }

    if (sel) {
      ctx.save(); ctx.translate(sel.x, sel.z); ctx.rotate(sel.angle);
      ctx.strokeStyle = '#e8590c'; ctx.lineWidth = 2.2; ctx.strokeRect(-sel.width / 2 - 2, -sel.depth / 2 - 2, sel.width + 4, sel.depth + 4);
      ctx.restore();
      const r = g.roads.find((x) => x.id === sel!.roadId);
      if (r) path(r.points, 1.6, '#e8590c', [3, 2]);
    }
  }

  function pickAt(ev: MouseEvent) {
    if (!G) return;
    const b = cv.getBoundingClientRect();
    const x = ((ev.clientX - b.left) / b.width) * W0, z = ((ev.clientY - b.top) / b.height) * H0;
    let best: typeof sel = null, bd = 1e9;
    for (const h of G.shown.buildings) {
      const dx = x - h.x, dz = z - h.z, ca = Math.cos(-h.angle), sa = Math.sin(-h.angle);
      const u = dx * ca - dz * sa, v = dx * sa + dz * ca;
      const d = Math.hypot(Math.max(0, Math.abs(u) - h.width / 2), Math.max(0, Math.abs(v) - h.depth / 2));
      if (d < bd) { bd = d; best = h; }
    }
    sel = bd < 6 ? best : null;
    draw(G);
    info.textContent = sel
      ? `Building ${sel.id} · ${sel.kind} · zone ${sel.zone} · ${sel.width}×${sel.depth} m · road ${sel.roadId ?? '–'}${sel.locked ? ' · LOCKED' : ''} · seed ${sel.seed}`
      : PICK_HINT;
  }

  function run() {
    const seed = seedIn.value.trim();
    if (!seed) { st.textContent = 'Enter a seed (any text).'; return; }
    st.textContent = 'Generating…';
    sel = null;
    setTimeout(() => {
      const t0 = performance.now();
      try {
        const own = seed === initial.brief.seed && brief === initial.brief;
        G = buildPreview(brief, seed, own ? initial.overrides : null, own ? initial.locked : []);
      } catch (e) {
        st.textContent = `Error: ${(e as Error).message}`;
        return;
      }
      const ms = Math.round(performance.now() - t0);
      resize();
      draw(G);
      const notes = [
        G.overridesApplied ? `overrides applied (${G.raw.buildings.length - G.shown.buildings.length} buildings removed${G.orphans.length ? `, ${G.orphans.length} stale` : ''})` : 'no overrides (other seed)',
        ...(G.raw.warnings.length ? [`⚠ ${G.raw.warnings.join('; ')}`] : []),
      ];
      st.textContent = `Seed "${seed}" · ${G.countsLine} (${G.singelGates} singel gates) · ${G.raw.trees.length} trees · ${G.raw.signs.length} signs · ${G.uniqueFootprints} unique footprints (1 m) · ${ms} ms · ${notes.join(' · ')}`;
    }, 30);
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
  q<HTMLButtonElement>('.b-new').addEventListener('click', () => { seedIn.value = nextSeed(seedIn.value); run(); });
  zoomBtn.addEventListener('click', () => {
    zoom = (zoom % 3) + 1;
    wrap.classList.remove('z2', 'z3');
    if (zoom > 1) wrap.classList.add(`z${zoom}`);
    zoomBtn.textContent = `Zoom ${zoom}×`;
  });
  chunkChk.addEventListener('change', () => { if (G) draw(G); });
  cv.addEventListener('click', pickAt);
  q<HTMLButtonElement>('.b-dl').addEventListener('click', () => {
    if (!G) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(G.raw)], { type: 'application/json' }));
    a.download = `town-${G.raw.briefId}.json`;
    a.click();
  });
  q<HTMLInputElement>('.b-brief').addEventListener('change', (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        brief = parseTownBrief(JSON.parse(t), f.name);
        seedIn.value = brief.seed;
        run();
      } catch (e) {
        st.textContent = `Brief error: ${(e as Error).message}`;
      }
    }, (e: unknown) => { st.textContent = `Brief error: ${String(e)}`; });
  });

  resize();
  run();
}
