/** zod schema for building recipes in packages/content. Validate at registry load. */
import { z } from 'zod';
import { ARCHETYPES, DISTRICTS } from './archetypes';
import { isSignText } from './signAtlas';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const colour = z.string().regex(/^(#[0-9a-fA-F]{6}|owner|ownerDark|ownerLight|brick|band|trim|ledge|roof|glass|lit|door|accent)$/);
const group = z.enum(['brick', 'plaster', 'roof', 'trim', 'gloss', 'glass', 'lit', 'sign']);
const share = z.number().min(0).max(1);

export const extraPartSchema = z.object({
  shape: z.enum(['box', 'roundedBox', 'cylinder', 'sphere', 'dome', 'torus', 'cone']),
  size: vec3,
  pos: vec3,
  rot: vec3.optional(),
  axis: z.enum(['x', 'y', 'z']).optional(),
  colour,
  group: group.optional(),
  mirrorX: z.boolean().optional(),
});

const propsSchema = z.object({
  ivy: z.boolean(),
  bike: z.boolean(),
  flatTyreBike: z.boolean(),
  wallAnchors: z.boolean(),
  kliko: z.boolean(),
  gardenStrip: z.boolean(),
  doormat: z.boolean(),
  parcel: z.boolean(),
  laundry: z.boolean(),
  satellite: z.boolean(),
  kingsFlag: z.boolean(),
  xmasLights: z.boolean(),
  birdNest: z.boolean(),
  pigeon: z.boolean(),
  posters: z.boolean(),
  mattress: z.boolean(),
  teKoop: z.boolean(),
  weeds: z.boolean(),
  neeNee: z.boolean(),
  yearStone: z.boolean(),
  synergyPlate: z.boolean(),
  linkedInBanner: z.boolean(),
  solarPanels: z.boolean(),
});

export const buildingRecipeSchema = z
  .object({
    style: z.literal('dutch_row'),
    archetype: z.string(),
    district: z.string(),
    width: z.number().min(2).max(20),
    depth: z.number().min(2).max(20),
    bays: z.number().int().min(1).max(8),
    groundFloorHeight: z.number().min(2).max(6),
    floorHeights: z.array(z.number().min(1.8).max(5)).max(6),
    facade: z.enum(['brick', 'plaster']),
    corners: z.enum(['quoins', 'pilaster', 'none']),
    taper: z.number().min(-0.08).max(0.08),
    corniceOverhang: z.number().min(0).max(0.5),
    bodyRadius: z.number().min(0).max(0.35),
    gable: z.object({
      kind: z.enum(['triangle', 'step', 'neck', 'bell', 'spout', 'cornice', 'flat']),
      height: z.number().min(0).max(8),
      rim: z.boolean(),
      finials: z.boolean(),
      window: z.boolean(),
      hoistBeam: z.boolean(),
      ornaments: z.boolean(),
    }),
    ground: z.object({
      kind: z.enum(['door', 'shop', 'pub', 'warehouse']),
      doorBay: z.number().int().min(0).optional(),
      steps: z.number().int().min(0).max(3),
      doorArch: z.boolean(),
      awning: z.boolean(),
      sign: z.boolean(),
    }),
    windows: z.object({
      upperBays: z.number().int().min(1).max(8).optional(),
      style: z.enum(['cross', 'grid', 'plain', 'modern']),
      arch: z.enum(['none', 'round', 'segment']),
      flowerBoxes: share,
      shutters: z.boolean(),
    }),
    roof: z.object({ tiles: z.boolean(), dormers: z.boolean() }),
    focal: z.enum(['none', 'roundWindow', 'bayWindow', 'niche', 'balcony', 'gableStone', 'bigSign']),
    identity: z.enum(['none', 'pub', 'bank', 'municipality', 'brewery', 'coffee', 'synergy', 'shop']),
    signText: z.string().nullable(),
    props: propsSchema,
    windowLife: z.object({ share, kinds: z.array(z.enum(['cat', 'plant', 'lamp', 'person', 'scarf', 'drawing', 'lace'])) }),
    boarded: share,
    weathering: share,
    sideWindows: z.boolean(),
    chimney: z.boolean(),
    drainpipe: z.boolean(),
    apron: z.boolean(),
    imperfection: share,
    colours: z.object({ brick: colour, band: colour, trim: colour, ledge: colour, roof: colour, glass: colour, lit: colour, door: colour, accent: colour }),
    litFraction: share,
    seed: z.number().int().min(0),
    extras: z.array(extraPartSchema),
  })
  .superRefine((r, ctx) => {
    if (r.gable.kind !== 'cornice' && r.gable.kind !== 'flat' && r.gable.height < 1) ctx.addIssue({ code: 'custom', message: 'gable height must be >= 1 unless cornice/flat', path: ['gable', 'height'] });
    if (r.ground.doorBay !== undefined && r.ground.doorBay >= r.bays) ctx.addIssue({ code: 'custom', message: 'doorBay out of range', path: ['ground', 'doorBay'] });
    if (r.width / r.bays < 0.9) ctx.addIssue({ code: 'custom', message: 'bays too narrow (< 0.9 m)', path: ['bays'] });
    if (r.width / (r.windows.upperBays ?? r.bays) < 0.9) ctx.addIssue({ code: 'custom', message: 'upper bays too narrow', path: ['windows', 'upperBays'] });
    if (r.signText !== null && !isSignText(r.signText)) ctx.addIssue({ code: 'custom', message: `signText "${r.signText}" is not in SIGN_TEXTS`, path: ['signText'] });
    if (r.props.mattress && r.focal !== 'balcony') ctx.addIssue({ code: 'custom', message: 'mattress needs focal balcony', path: ['props', 'mattress'] });
    if (!(r.archetype in ARCHETYPES) && r.archetype !== 'pub') ctx.addIssue({ code: 'custom', message: `unknown archetype ${r.archetype}`, path: ['archetype'] });
    if (!(r.district in DISTRICTS)) ctx.addIssue({ code: 'custom', message: `unknown district ${r.district}`, path: ['district'] });
  });
