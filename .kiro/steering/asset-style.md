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
