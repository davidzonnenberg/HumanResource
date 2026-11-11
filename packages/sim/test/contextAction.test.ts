// Property 22: Context action selection (task 7.11; Requirements 13.2, 13.6, 14.2, 14.3, 14.5, 39.1).
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { dist2d } from '../src/core/math';
import { contextActionFor } from '../src/interaction/contextAction';
import { entrance } from '../src/world/geometry';
import { PLAYER } from '../src/state/types';
import { freshSim, registry } from './helpers';

const reg = registry();
const range = reg.config.interactionRange;

describe('context action selection', () => {
  // Feature: human-resource-mvp, Property 22: Context action selection
  it('Property 22: any offered target is within Interaction_Range and never an owned Business', () => {
    fc.assert(
      fc.property(fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -60, max: 60, noNaN: true }), (x, z) => {
        const sim = freshSim(1);
        sim.state.ceo.x = x;
        sim.state.ceo.z = z;
        const action = contextActionFor(sim.state, reg);
        if (!action) return;
        if (action.targetKind === 'vehicle') {
          const v = sim.state.vehicles[action.targetId];
          expect(v).toBeDefined();
          expect(dist2d(x, z, v?.pose.x ?? 0, v?.pose.z ?? 0)).toBeLessThanOrEqual(range);
          expect(['drive', 'inspect']).toContain(action.kind);
        } else if (action.targetKind === 'business') {
          const b = sim.state.businesses[action.targetId];
          expect(b).toBeDefined();
          expect(b?.owner).not.toBe(PLAYER); // owned Businesses are entered automatically (14.3)
          const door = entrance(reg, b?.plotId ?? '');
          expect(dist2d(x, z, door.x, door.z)).toBeLessThanOrEqual(range);
        }
      }),
    );
  });

  // Feature: human-resource-mvp, Property 22: Context action selection (purity)
  it('Property 22: selection is pure, the same state gives the same answer and leaves the state unchanged', () => {
    fc.assert(
      fc.property(fc.double({ min: -60, max: 60, noNaN: true }), fc.double({ min: -60, max: 60, noNaN: true }), (x, z) => {
        const sim = freshSim(2);
        sim.state.ceo.x = x;
        sim.state.ceo.z = z;
        const before = structuredClone(sim.state);
        const first = contextActionFor(sim.state, reg);
        expect(contextActionFor(sim.state, reg)).toEqual(first);
        expect(sim.state).toEqual(before);
      }),
    );
  });

  it('far from everything there is no action', () => {
    const sim = freshSim(3);
    sim.state.ceo.x = 1_000_000;
    sim.state.ceo.z = 1_000_000;
    expect(contextActionFor(sim.state, reg)).toBeNull();
  });

  it('standing on the player van offers Drive', () => {
    const sim = freshSim(4);
    const van = Object.values(sim.state.vehicles).find((v) => v.owner === PLAYER);
    if (!van) throw new Error('start state has no player Vehicle');
    sim.state.ceo.x = van.pose.x;
    sim.state.ceo.z = van.pose.z;
    expect(contextActionFor(sim.state, reg)).toEqual({ kind: 'drive', targetKind: 'vehicle', targetId: van.id });
  });

  it('standing on a rival van offers Inspect, not Drive', () => {
    const sim = freshSim(5);
    const rival = Object.values(sim.state.vehicles).find((v) => v.owner !== PLAYER);
    if (!rival) throw new Error('start state has no rival Vehicle');
    sim.state.ceo.x = rival.pose.x;
    sim.state.ceo.z = rival.pose.z;
    expect(contextActionFor(sim.state, reg)).toEqual({ kind: 'inspect', targetKind: 'vehicle', targetId: rival.id });
  });
});
