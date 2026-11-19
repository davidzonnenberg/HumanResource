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
  it('Property 22: any offered target is within Interaction_Range; owned Businesses offer Enter, rivals Inspect', () => {
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
          expect(action.kind).toBe(b?.owner === PLAYER || (b && reg.businesses[b.defId]?.office !== undefined) ? 'enter' : 'inspect'); // offices open their counter // 14.3: enter at the door
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

  it('at the door of the own pub: Enter teleports inside, Leave only at the interior door', () => {
    const sim = freshSim(6);
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === PLAYER && reg.businesses[b.defId]?.pub);
    if (!pub) throw new Error('start state has no player pub');
    const door = entrance(reg, pub.plotId);
    const plot = reg.world.plots[pub.plotId]?.def;
    if (!plot) throw new Error('pub has no plot');
    const out = door.z > plot.z ? 1 : -1;
    sim.state.ceo.x = door.x;
    sim.state.ceo.z = door.z + out * 1;
    expect(contextActionFor(sim.state, reg)).toEqual({ kind: 'enter', targetKind: 'business', targetId: pub.id });
    sim.submit({ type: 'ceoEnter', businessId: pub.id });
    sim.tick();
    expect(sim.state.ceo.insideBusinessId).toBe(pub.id);
    expect(contextActionFor(sim.state, reg)).toEqual({ kind: 'exitBuilding', targetKind: 'business', targetId: pub.id });
    // Walking to the back of the room: no Leave offered there, and the back wall stops the CEO.
    for (let i = 0; i < 100; i++) {
      sim.submit({ type: 'ceoMove', dx: 0, dz: -out });
      sim.tick();
    }
    expect(sim.state.ceo.insideBusinessId).toBe(pub.id);
    expect(Math.abs(sim.state.ceo.z - plot.z)).toBeLessThan(plot.d / 2);
    expect(contextActionFor(sim.state, reg)).toBeNull();
    // Walking into the front wall also stays inside (no walking out through the door).
    for (let i = 0; i < 100; i++) {
      sim.submit({ type: 'ceoMove', dx: 0, dz: out });
      sim.tick();
    }
    expect(Math.abs(sim.state.ceo.z - plot.z)).toBeLessThan(plot.d / 2);
    sim.submit({ type: 'ceoExit' });
    sim.tick();
    expect(sim.state.ceo.insideBusinessId).toBeNull();
    expect(Math.abs(sim.state.ceo.z - plot.z)).toBeGreaterThan(plot.d / 2);
  });

  it('Leave uses a plausible exterior door point from the client, else the plot entrance', () => {
    const sim = freshSim(7);
    const pub = Object.values(sim.state.businesses).find((b) => b.owner === PLAYER);
    if (!pub) throw new Error('start state has no player Business');
    const door = entrance(reg, pub.plotId);
    sim.state.ceo.insideBusinessId = pub.id;
    sim.submit({ type: 'ceoExit', x: door.x + 0.5, z: door.z + 2 });
    sim.tick();
    expect(sim.state.ceo).toMatchObject({ insideBusinessId: null, x: door.x + 0.5, z: door.z + 2 });
    sim.state.ceo.insideBusinessId = pub.id;
    sim.submit({ type: 'ceoExit', x: door.x + 500, z: door.z });
    sim.tick();
    expect(sim.state.ceo.x).toBe(door.x); // implausible hint ignored
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
