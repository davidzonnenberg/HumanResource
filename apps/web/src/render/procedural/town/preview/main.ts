// Entry of docs/previews/town-map-preview.html. Bundled by scripts/town-preview.ts (`npm.cmd run town:preview`).
// The page opens with the committed town-brief.json and town-overrides.json; "Load brief" swaps the brief.
import briefJson from '../../../../../../../packages/content/data/maps/town-brief.json';
import overridesJson from '../../../../../../../packages/content/data/maps/town-overrides.json';
import { parseTownBrief, parseTownOverrides } from '../townSchema';
import type { Building } from '../townTypes';
import { mountTownPreview } from './townPreview';

// Locked buildings of the committed bake, injected by scripts/town-preview.ts: `town:bake --force` passes them to the
// generator, so the preview needs them to reproduce the committed bake.
declare const __TOWN_LOCKED__: Building[];

const root = document.getElementById('tm-root');
if (root) mountTownPreview(root, { brief: parseTownBrief(briefJson), overrides: parseTownOverrides(overridesJson), locked: __TOWN_LOCKED__ });
