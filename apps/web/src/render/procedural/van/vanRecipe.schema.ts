/** zod schema for van recipes in packages/content. Validate at registry load. */
import { z } from 'zod';

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const colour = z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.enum(['owner', 'ownerDark', 'ownerLight'])]);
const positive = z.number().positive();

const base = {
  pos: vec3,
  rot: vec3.optional(),
  colour,
  mirrorZ: z.boolean().optional(),
  segments: z.number().int().min(1).max(48).optional(),
};

export const vanPartSchema = z.discriminatedUnion('shape', [
  z.object({ shape: z.enum(['box', 'roundedBox']), size: z.tuple([positive, positive, positive]), radius: z.number().min(0).optional(), ...base }),
  z.object({ shape: z.literal('cylinder'), radius: positive, length: positive, axis: z.enum(['x', 'y', 'z']), ...base }),
]);

export const vanRecipeSchema = z
  .object({
    parts: z.array(vanPartSchema).min(1),
    wheels: z.object({
      radius: positive,
      width: positive,
      anchors: z.array(vec3).min(2).max(8),
      steering: z.array(z.number().int().min(0)),
      maxSteerRad: z.number().min(0).max(1.2),
      tyreColour: colour,
      rimColour: colour,
      hubColour: colour,
      spokes: z.number().int().min(1).max(8),
    }),
    rig: z.object({
      steerPerTurnRate: z.number().min(0),
      steerSmoothing: positive,
      motionSmoothing: positive,
      bodySmoothing: positive,
      rollPerLateral: z.number(),
      maxRollRad: z.number().min(0).max(0.5),
      pitchPerAccel: z.number(),
      maxPitchRad: z.number().min(0).max(0.5),
      bobAmplitude: z.number().min(0).max(0.2),
      bobFrequencyHz: z.number().min(0),
      bobFullSpeed: positive,
      squashAmount: z.number().min(0).max(0.5),
      squashDecay: positive,
      teleportDistance: positive,
    }),
  })
  .superRefine((r, ctx) => {
    r.wheels.steering.forEach((i) => {
      if (i >= r.wheels.anchors.length) ctx.addIssue({ code: 'custom', message: `steering index ${i} has no anchor`, path: ['wheels', 'steering'] });
    });
  });
