# Procedural van – drop-in

## Files
| Path | What |
|---|---|
| apps/web/src/render/procedural/van/vanRecipe.ts | Types + DEFAULT_VAN_RECIPE (all tunables) |
| apps/web/src/render/procedural/van/vanRecipe.schema.ts | zod schema, validate at content load |
| apps/web/src/render/procedural/van/vanGeometry.ts | Merged, vertex-coloured, cached body + wheel geometry, one matte material |
| apps/web/src/render/procedural/van/vanRig.ts | Pure per-frame maths: spin, steer, roll, pitch, bob, squash |
| apps/web/src/render/procedural/van/ProceduralVan.tsx | R3F component with the wheel hierarchy |
| packages/content/data/models/van_small.recipe.json | Same recipe as JSON, for the models.json entry |
| docs/previews/van-preview.html | Standalone preview (open in a browser, needs internet for three.js from unpkg) |

Web/render only. Nothing touches packages/sim, saves or the RNG. Math.sin/cos are fine here; the ban only applies to the sim.

## Conventions
- Metres, van faces +X, up +Y, right side +Z, ground y = 0.
- Heading: radians, 0 = +X, positive = turning left (= object.rotation.y).
  If the sim uses another convention, convert in the motion adapter, not in the van.
- Colours: '#rrggbb' or 'owner' / 'ownerDark' / 'ownerLight', resolved at render time.

## Hook it up
```tsx
const motion = useRef<VanMotion>({ x: 0, z: 0, heading: 0 });
useFrame(() => {
  // auto van: interpolated pose from simBridge
  const p = simBridge.vehiclePose(vehicleId);       // adapt to the real API
  motion.current.x = p.x; motion.current.z = p.z; motion.current.heading = p.heading;
  // manual driving: also set motion.current.steer, .compression (per wheel), .y, and impact++ on crashes
});
<ProceduralVan modelKey="van_small" recipe={recipe} ownerColour={ownerColour} motion={motion} />
```
Register `van_small` in MODEL_MAP as a procedural entry and route it to ProceduralVan.

## Tuning
Open docs/previews/van-preview.html: WASD/arrows drive, Space bumps, C toggles an auto circle,
owner colour swatches. Change values in vanRecipe.ts, then copy to the JSON.
