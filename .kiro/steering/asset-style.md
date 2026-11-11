---
inclusion: auto
name: asset-style
description: Read when generating images, meshes or 3D assets for Human Resource (ComfyUI, Hunyuan, prompts, renders, textures, glTF). Holds the standard visual-language prompt.
---

# Human Resource – asset generation style

Use this whenever you generate images or 3D assets for the game (ComfyUI image step, then Hunyuan image-to-3D). Every generation uses the same base prompt so assets share one visual language and match the renderer.

The look is deliberately **goofy, cartoony and Overcooked-like**: a funny, toy-like, satirical world with a saturated palette and silly proportions. This is set by the spec, not optional — see `requirements.md` Requirement 20 (Tone and Presentation), Requirement 13 (Manual Goofy Driving), and `design.md` ("Overcooked-like miniature look").

## Standard base prompt (prefix for every asset)

```
Chunky goofy cartoony 3D game asset, playful toy-like miniature
proportions, oversized exaggerated features, simple bold geometric forms,
thick rounded bevelled edges, squashy charming silhouette, bright
saturated matte colors, single flat color per surface, minimal surface
detail, no baked shadows, soft even studio lighting, three-quarter view
slightly from above, complete isolated object centered in frame, plain
pure white background, no environment, no ground plane, no shadow on
ground, no people, no text, no watermark.
```

Append the specific subject after this prefix (for example: `... a cosy corner pub building`).

## Standard negative prompt (ComfyUI image step)

```
realistic, photorealistic, gritty, high detail, noisy texture, busy
pattern, cluttered, multiple objects, scene, background, landscape,
ground plane, cast shadow, text, logo, watermark, blurry, low contrast,
dark, flat front view, cropped, cut off.
```

## Why these constraints (keep them, do not drop)

- **Three-quarter view slightly from above, not orthographic** — the in-game camera is a fixed perspective (fov ~35°, tilt 52–68°, yaw never rotates; see `camera.json`). A clean three-quarter perspective shot also reconstructs better in Hunyuan.
- **No baked shadows / flat even lighting** — the renderer has no shadow maps and no post-processing, so any baked shadow or heavy ambient occlusion will look wrong in-engine.
- **Single flat color per surface, bright saturated matte** — matches the `theme.json` palette and keeps runtime owner-tinting clean.
- **Isolated, centered, white background, no ground plane** — Hunyuan needs a clean single subject to make a usable mesh.

## Palette anchors (from `packages/content/data/config/theme.json`)

Ground `#9fd36b`, road `#5b5f6a`, crate `#c68642`, roof `#e76f51`, sky `#bde3ff`.
Owner tints: player `#3a86ff`, rival `#ef476f`, npc `#8d99ae`.

Owner-tinted buildings (pub, supplier) are recolored in-engine, so generate those as a **neutral light grey/off-white** base unless told otherwise, so the tint reads.

## Model keys this feeds (from `models.json` / `modelMap.ts`)

`human`, `customer`, `ceo`, `crate_beer`, `building_pub`, `building_pub_rival`, `building_supplier`, `plot_empty`, `plot_for_sale`, `vehicle_van`. A generated glTF replaces a placeholder by editing one entry in `apps/web/src/render/assets/modelMap.ts` (change `kind: 'primitive'` to `kind: 'gltf'`).

## Ground, streets and tiling (keep buildings and ground separate)

Generated building GLBs currently bake a cobble base into the mesh (the pub
render had a cobble octagon under it). Stop doing that. Separate the ground
from the building:

- **Buildings** are just the building (walls, roof, sign, door, awnings,
  plants) sitting on a flat footprint. No ground patch, no cobble skirt.
- **Ground/streets** are their own reusable tile assets, instanced across the
  map by the renderer.

Reasons: a baked ground patch bloats every building, won't align against a
neighbour, and a per-building ground skirt can never tile. A separate tile is
tiny (one mesh reused via GPU instancing), aligns perfectly on the grid, and
matches the flat-color style already defined above.

### The tile kit (small repeatable shapes, copy-pasted)

Author a tile as a single square sized to one plot/grid unit, built to tile
seamlessly (left edge continues into right, top into bottom). The engine
instances it; we do not generate a whole street as one mesh. New model keys
for `modelMap.ts` / `models.json`, same `kind: 'primitive' -> 'gltf'` swap as
every other asset:

- `tile_road` — straight road/paver. Herringbone (visgraat) brick reads very
  Dutch. For herringbone the repeating unit must be a **2x2 brick block**, not
  a single brick, or the pattern will not tile.
- `tile_sidewalk` — stoep, brick pavers in a different color (stretcher bond).
- `tile_curb` — corner / edge trim: the gutter line between road and sidewalk.
- `tile_cobble` — optional old-town square variant.

### Dutch / European klinker palette

Classic Dutch street = *klinkers* (brick pavers), herringbone or stretcher
bond. Suggested anchors, same flat-matte treatment as the main palette:
- road klinker warm red-brown `#9c4a2e`
- sidewalk klinker grey-brown `#8a7a6a`
- curb / gutter darker grey `#5b5f6a` (reuses the existing `road` anchor)
Keep single flat color per surface; no baked shadow; owner tint does not apply
to ground tiles.

## GLB size budget (the 35 MB problem)

Generated buildings have been ~35 MB each, far too heavy for a mobile game.
Target low hundreds of KB per building. Bake these habits into every export:

- **Decimate hard.** The chunky style needs very few polys; the rounded
  bevels are usually most of the triangle budget. Reduce aggressively.
- **Drop textures.** The style is single flat color per surface, no baked
  shadows, so most surfaces need only a flat material (vertex color or a tiny
  palette texture), not a 2K PBR set. Baked textures are almost always the
  bulk of a 35 MB file.
- **Compress on export.** Always run Draco or Meshopt geometry compression,
  and KTX2/Basis for any texture that survives.

### Workflow

1. `gltf-transform inspect yourfile.glb` (from `@gltf-transform/cli`) to see
   the mesh-vs-texture split and know what to attack first.
2. `gltf-transform optimize yourfile.glb out.glb` for a one-pass Draco +
   texture-compression + dedupe cleanup.
3. Re-inspect to confirm the size landed in the hundreds-of-KB range before
   wiring it into `modelMap.ts`.
