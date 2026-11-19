// Generated rows of houses along the filler streets (docs/buildings.md). Visual, plus a hitbox from
// the recipe width x depth registered like a landmark so walking and driving stop at the walls.
import { memo, useLayoutEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { landmarks } from '@hr/content';
import type { DefinitionRegistry, SimState } from '@hr/sim';
import { setFootprint } from '../../footprints';
import { ProceduralBuilding } from './ProceduralBuilding';
import { houseFootprint } from './streets';
import { FILLER_STREETS } from './streetsSchema';
import { layoutFillerStreets, type LandmarkRect } from './streetsLayout';
import { layoutSlotHouses, slotBlockers } from '../../frontage';

/** Neutral accent for houses nobody owns (the same grey as NPC buildings). */
const HOUSE_COLOUR = '#8d99ae';
// Measured (17 houses, old_town): 'high' is 108k-217k triangles per house (2.5M total, budget 80k each) and
// 'low' is 19k-32k (0.42M total). Use 'low' until the performance pass (spec task 7) tunes it.
const HOUSE_DETAIL = 'low' as const;

export const FillerStreets = memo(function FillerStreets({ reg, districts }: { reg: DefinitionRegistry; districts: SimState['districts'] }) {
  // Filler slots of the frontage layout keep the generated rows away (their rectangles are blockers) and add their own houses.
  const houses = useMemo(() => [...layoutFillerStreets(reg, FILLER_STREETS, [...(landmarks as LandmarkRect[]), ...slotBlockers(reg)]), ...layoutSlotHouses(reg)], [reg]);
  const streetDistrict = useMemo(() => new Map(FILLER_STREETS.map((s) => [s.id, s.district])), []);
  const shown = houses.filter((h) => {
    const district = h.gapId.startsWith('slot:') ? reg.world.slots[h.gapId.slice(5)]?.districtId : streetDistrict.get(h.gapId.split('@')[0] ?? '');
    return districts[district ?? '']?.unlocked;
  });
  // Build one house per frame instead of all at once (each takes about 0.1 s), so loading does not freeze.
  const [built, setBuilt] = useState(0);
  useFrame(() => {
    if (built < shown.length) setBuilt(built + 1);
  });
  useLayoutEffect(() => {
    for (const h of shown) setFootprint(`landmark:${h.id}`, houseFootprint(h));
  }, [shown.length, houses]);
  return (
    <group>
      {shown.slice(0, built).map((h) => (
        <ProceduralBuilding key={h.id} recipe={h.recipe} ownerColour={HOUSE_COLOUR} detail={HOUSE_DETAIL} position={[h.x, 0, h.z]} rotation={[0, h.heading, 0]} />
      ))}
    </group>
  );
});