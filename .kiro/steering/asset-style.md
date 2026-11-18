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

## World style – old-town Dutch / German

The world is an **old-town Dutch-German canal-town**: old buildings, tall narrow
gabled houses, narrow streets, brick everything. Think Amsterdam / Utrecht canal
houses and Hanseatic German townhouses, done in the chunky goofy style above.

Append this block to the base prefix when generating a **building**:

```
old-town Dutch-German canal-house style, tall narrow gabled townhouse,
stepped crow-step and bell gable roofline, steep pitched roof, red-brown
brick facade with painted shutters, white window trim, tall slender
windows in a grid, a little hoisting beam under the gable, cosy storybook
Amsterdam-Utrecht-Hanseatic look, squeezed narrow footprint as if wedged
between neighbours.
```

Generate buildings **tall and narrow, not wide** — the narrow footprint is what
lets them sit shoulder-to-shoulder along a narrow street.

**Looser variant for variety** — the block above pins color and gable details,
so it tends to print near-identical houses. Use this looser block when you want
different-looking houses each run (it leaves color and gable shape open):

```
old-town Dutch-German canal-house style, a tall narrow gabled townhouse,
one of many varied unique designs, surprising gable shape, a single
coherent facade color with matching trim, calm muted brick tones, one or
two colors per house only, pitched roof, storybook Amsterdam-Hanseatic
charm, flush street frontage, narrow footprint.
```

Keep it from going rainbow: `a single coherent facade color` + `one or two
colors per house only` + `calm muted brick tones` stop the per-brick mosaic
you get otherwise. `flush street frontage` keeps the building meeting the road
with no front garden.

For even more variety between houses, change the **seed** every run (same
prompt + same seed = same house) and lower CFG/guidance a bit (e.g. 7 → 4–5).

**Buildings are roadside** — no trees, bushes, grass, fences or ground base.
Add these to the standard negative prompt for every building:

```
trees, bushes, plants, grass, lawn, garden, hedge, fence, flowers,
ground plane, base plate, terrain tile, rainbow colors, multicolored
bricks, patchwork of colors, every brick different color, oversaturated.
```

Both building blocks use the standard negative prompt below plus these
building-specific extras (not the tile extras).

### Pubs (building_pub / building_pub_rival) – varied heights and sizes

Same style, pub subject. Use the standard base prefix + this block + the
building negative prompt (standard + building extras):

```
old-town Dutch-German canal-house style, a cosy corner pub / brown cafe
(bruine kroeg), gabled townhouse with a pub ground floor, big warm-lit
front windows, a hanging pub sign bracket over the door, a small awning,
beer-cafe charm, one of many varied unique designs, surprising gable
shape, a single coherent facade color with matching trim, calm muted
brick tones, one or two colors per house only, pitched roof, storybook
Amsterdam-Hanseatic look, flush street frontage, <SIZE PHRASE>.
```

Swap `<SIZE PHRASE>` per generation to force different heights and sizes:

- `a short squat two-storey pub, wide stout footprint`
- `a tall narrow three-storey pub, slim footprint`
- `a very tall skinny four-storey pub, extra narrow footprint`
- `a broad corner pub on a corner plot, L-shaped footprint`

Owner-tinted pubs are recolored in-engine, so decide up front: neutral light
grey/off-white base (tint reads cleanly) or baked brown-cafe color (no tint).

### Town offices for the Grand Opening (planned, see `docs/ideas.md`)

The planned start sends the CEO to a Municipality (town hall), a Bank and a Job
centre / café notice board. These are npc buildings, so they are not tinted
by owner: bake their own colours. Use the same canal-house style so they sit in
the street, but give each one a readable silhouette from the fixed camera:

- Municipality: a slightly grander stepped-gable town hall, a small clock or
  bell tower, a flag, a stone stair, and a "ticket number" sign by the door.
- Bank: a narrow, smug, overly polished facade, columns or pilasters, gold
  lettering band, a revolving-door look.
- Job centre: a modest office or café front with a big notice board / posters
  in the window ("passionate about synergy").

The tone stays toy-like and satirical: the institutions look a bit too
self-important for a tiny street.

### Landmarks (city hall and other big buildings, about 2x a canal house)

Same base prefix and building negatives. Swap "tall narrow" for a wide,
grand frontage and keep it chunky, so it still reads as part of the street:

```
old-town Dutch-German canal-town style, a grand but goofy town hall
landmark, about twice as wide as a canal house, symmetrical facade with a
big central stepped gable, one oversized chunky clock tower rising from the
middle of the roof, a tiny flag on top, wide stone staircase across the
front leading to a big double wooden door, cream stone trim around tall
arched windows, warm red-brown brick, pitched slate-grey roof, a small
balcony above the door, lanterns beside the entrance, flush street
frontage, flat back side, a single coherent facade color with matching
trim, calm muted brick tones, two or three colors only, smooth simple
surfaces, satirical self-important bureaucratic look.
```

Extra negatives: `people, cars, readable letters, signage text, statues,
fountain, courtyard, side wings, asymmetrical`.

Image step: 1024x1024 (the pre-processor crops to 1024 anyway), keep the
whole building inside the frame with about 10% white margin (a wide
building gets cropped first, and a cut-off tower ruins the mesh). CFG about
4-5, 30+ steps, new seed per try, pick the image with the cleanest
silhouette and the fewest thin spikes.

3D step (Pixal3D/Trellis2 graph): Remesh 1024 (thin tower and window frames
need it), Decimate about 120000 (one landmark may cost more than a canal
house), Unwrap padding 4, Texture Resolution and Render UV Atlas 2048, AO
strength 0, metallic/roughness/normal_map unplugged. Then
`npm.cmd run models:optimize -- --texture=2048`.

### Street tile (klinker / cobble) – repeatable, top-down

Streets are a tiny mesh GPU-instanced across the grid (copy-paste next to each
other). The texture tile must tile seamlessly, so generate it **flat top-down
orthographic**, NOT the three-quarter building view, and force a 2x2 brick
repeat unit for herringbone or it will not tile:

```
Flat top-down orthographic texture tile, seamless repeating pattern, Dutch
klinker brick street paving, herringbone visgraat layout, warm red-brown
baked-clay bricks, tight mortar lines, 2x2 brick repeating block so edges
tile seamlessly left-to-right and top-to-bottom, bright saturated matte
colors, single flat color per brick, minimal surface detail, no baked
shadows, soft even flat lighting, fills the entire square frame edge to
edge, no border, no object, no background, no perspective, no text, no
watermark.
```

**Match the building style, not a photo.** A realistic paving tile (fine bricks,
sharp grout) looks pasted-on next to the soft clay-like buildings. Add this to
the tile prompt: `large chunky cartoon paving bricks, thick soft rounded grout,
painted clay toy look, smooth surfaces, no grain, no noise, no fine detail, few
big bricks`, and add to the negatives: `photorealistic, realistic stone, grain,
noise, fine detail, pbr texture, scratches, weathering`.
In-game, `ROAD_TILE_SIZE` (World.tsx) sets brick size: bigger = larger, softer.
The tile also has to tile: generate it with a seamless/circular-padding node, or
check the edges (a wrap-around edge diff far above neighbouring columns = visible seams).

Sidewalk variant: swap `herringbone visgraat layout` → `stretcher bond layout`
and `warm red-brown baked-clay bricks` → `grey-brown klinker pavers`.

For tiles, extend the standard negative prompt with:
`perspective, three-quarter view, tilt, object, building, border, vignette`.

### Ground texture tiles – grass (two layers that blend with random fades)

Do NOT prepend the standard base prefix to ground tiles: it asks for an
"isolated object / three-quarter view / white background" and produces a grass
block. Use these flat top-down prompts. Generate the two layers with the same
settings so blade size, style and brightness match, or the blend looks wrong.

Grass A (main ground):

```
Flat top-down orthographic seamless tileable texture, chunky cartoon grass,
soft rounded clay-toy grass blades, simple bold shapes, bright saturated matte
green with a few slightly lighter and darker green tones, minimal detail, no
baked shadows, soft even flat lighting, the pattern fills the entire square
frame edge to edge, repeating pattern with no border, no vignette, no object,
no soil, no dirt, no ground edge, no perspective, no text, no watermark.
```

Grass B (second layer, blended in as random patches): same prompt, swap the
colour phrase `bright saturated matte green with a few slightly lighter and
darker green tones` for `slightly darker olive-yellow meadow green with a few
lighter and darker tones`. For a dirt layer use `warm brown packed earth` and
`small chunky pebbles` instead of grass and drop `no soil, no dirt` from the prompt.

Negative prompt for all ground tiles:

```
three-quarter view, perspective, isometric, tilt, block, cube, slab, diorama,
soil, dirt, brown, edge, border, vignette, cast shadow, single object, isolated
object, white background, photorealistic, realistic grass, fine detail, noise,
text, logo, watermark.
```

(For the dirt layer remove `soil, dirt, brown` from the negatives.) Keep the
main grass close to the ground anchor `#9fd36b`. In-game the two layers are
mixed by a world-space noise mask with a soft edge (planned, not built yet).

### Ground tile kit in the chunky style (road, sidewalk, cobble, dirt)

Same chunky clay look as the grass tiles, so the whole ground matches. This
supersedes the photo-like street tile prompt above (that one produced sharp,
realistic paving that clashed with the buildings). Fill in `<SUBJECT>`:

```
Flat top-down orthographic seamless tileable texture, <SUBJECT>, chunky cartoon
clay-toy look, soft rounded shapes, thick soft grout, simple bold forms,
saturated but slightly muted matte colors, minimal detail, no baked shadows,
soft even flat lighting, the pattern fills the entire square frame edge to edge,
repeating pattern with no border, no vignette, no object, no perspective, no
text, no watermark.
```

Subjects:

- Road klinker (`tile_road`): `Dutch klinker brick street paving, herringbone visgraat layout on a 2x2 brick repeating block, warm red-brown baked-clay bricks`
- Sidewalk (`tile_sidewalk`): `Dutch sidewalk pavers, stretcher bond layout, grey-brown klinker bricks, slightly lighter than the road`
- Old-town cobble (`tile_cobble`): `old-town round cobblestone square paving, rounded stones, grey and warm tan stones`
- Dirt (`tile_dirt`): `warm brown packed earth with small chunky pebbles`

Negative prompt for brick / cobble / dirt tiles (the grass negative minus
`soil, dirt, brown`, which would fight brown bricks and earth):

```
three-quarter view, perspective, isometric, tilt, block, cube, slab, diorama,
edge, border, vignette, cast shadow, single object, isolated object, white
background, photorealistic, realistic stone, fine detail, noise, grain, text,
logo, watermark.
```

Grass keeps its own prompt and negative (section above). Tiles must tile: use a
seamless/circular-padding node, then check edges with `scripts/makeSeamlessTile.ps1`.

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

### Folders and the one-command shrink (use this)

- Raw ComfyUI/Trellis exports go in `assets-src/models-raw/` (gitignored, never edited).
- Run `npm run models:optimize` from the project root. It reads raw, writes
  game-ready copies to `apps/web/public/models/` (served at `/models/<name>.glb`).
- Re-runnable: input is always the raw file, so triangles are never lost twice.
  Only new or changed raw files are rebuilt. Flags: `--force`, `--ratio=0.05`,
  `--texture=256`.
- File name = model key, e.g. `building_pub.glb`, then `url: '/models/building_pub.glb'` in `modelMap.ts`.
- Meshopt-compressed output needs `MeshoptDecoder` set on the GLTF loader.
- **Do not cut triangles in the script** (default `--ratio=1`). Tested on a
  house: cutting 80k -> 32k/48k after the bake gave dark smears and bigger
  holes. The script only compresses (meshopt + WebP, ~1 MB per building).
- Reduce triangles in ComfyUI instead (Decimate Mesh before UV unwrap/bake).
  Working baseline: Remesh Mesh resolution 768, Decimate target_face_count
  80000, Unwrap padding 4, Texture Resolution 2048, AO strength 0,
  metallic/roughness/normal unplugged. Lower Remesh (512) = ragged window
  frames; bigger cut = more small holes in brick.

### Manual workflow (single file)

1. `gltf-transform inspect yourfile.glb` (from `@gltf-transform/cli`) to see
   the mesh-vs-texture split and know what to attack first.
2. `gltf-transform optimize yourfile.glb out.glb` for a one-pass Draco +
   texture-compression + dedupe cleanup.
3. Re-inspect to confirm the size landed in the hundreds-of-KB range before
   wiring it into `modelMap.ts`.

## Enterable buildings – roof vs. separate interior (design note)

Image-to-3D only reconstructs the outer shell, so there is no real interior
behind the walls and you cannot reliably generate a matching "roof removed"
version of the same building. Two viable approaches:

- **Roofless / open-top exterior** (cheapest): prompt the building open-top
  and let the fixed top-down-ish camera look into a simple floor. Or split the
  roof into its own mesh (`shell` + `roof` in one GLB, via a local
  `gltf-transform` / `trimesh` script, free on the AI box) and hide `roof`
  when the player is inside. Exterior and interior must share scale here.

- **Stardew-Valley-style separate interior** (easy + fun): do NOT try to align
  inside and outside at all. No auto-walking inside; instead a **go-in /
  teleport button** that swaps to a separate screen showing just the building
  interior. Because it is its own scene, sizes do not need to match — a small
  building on the street can be huge on the inside. This sidesteps the roof
  problem entirely and is the recommended path if we want real interiors.

  Status (Nov 2026): the Stardew-style approach is BUILT. Press E at the drawn
  model's door and the scene shows only that building's interior. Today the
  interior is the old box shell at the plot's position, so a separate,
  bigger interior scene is still possible later.

## Chosen ground set (in use)
- Road: klinker_00001 (herringbone) -> `tile_road.jpg`
- Sidewalk: pavement_00002 (grey) -> `tile_sidewalk.jpg`, raised box `CURB_H` 0.35, plain light curb sides
- Grass A: grass_00003 -> `tile_grass_a.jpg` (tinted in shader, `GRASS_TINT`)
- Grass B: grass_00005 (dry yellow) -> `tile_grass_b.jpg`, mixed in by world noise
- Dirt: dirt_00002 -> `tile_dirt.jpg`, worn patches
- Tune in `render/World.tsx`: `GROUND_TILE`, `GRASS_TINT`, noise thresholds, `ROAD_TILE_SIZE`, `SIDEWALK_TILE`, `CURB_H`.
- Fake shadows: gradient strip at curb foot (`Sidewalks`), radial blob per building (`BuildingShadows`). No shadow maps.
