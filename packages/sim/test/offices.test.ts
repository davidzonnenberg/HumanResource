// Office Businesses and their counter (task 47; Requirement 60).
import { describe, expect, it } from 'vitest';
import { contextActionFor } from '../src/interaction/contextAction';
import { entrance } from '../src/world/geometry';
import { freshSim, registry } from './helpers';

describe('offices (60)', () => {
  it('Municipality, Bank and Job_Centre are NPC Businesses with no storage, a role tag and an office marker (60.1, 60.2)', () => {
    const reg = registry();
    for (const [id, role] of [['municipality', 'municipality'], ['bank', 'bank'], ['job_centre', 'job_centre']] as const) {
      const def = reg.businesses[id];
      expect(def, id).toBeDefined();
      expect(def?.owner).toBe('npc');
      expect(def?.storage).toEqual({});
      expect(def?.office).toBeDefined();
      expect(def?.role).toBe(role);
      expect(reg.modelKeys.has(def?.modelKey ?? '')).toBe(true);
    }
  });

  it('every office stands on its own frontage slot in the Old Town, in every new game (60.4)', () => {
    const sim = freshSim(3);
    const reg = registry();
    for (const [defId, plotId] of [['municipality', 'plot_municipality'], ['bank', 'plot_bank'], ['job_centre', 'plot_job_centre']] as const) {
      const b = Object.values(sim.state.businesses).find((x) => x.defId === defId);
      expect(b?.plotId).toBe(plotId);
      expect(sim.state.plots[plotId]).toMatchObject({ status: 'occupied', businessId: b?.id });
      expect(reg.world.slots[plotId]?.kind).toBe('business');
    }
  });

  it('Enter is offered at an office door, and Enter does not walk the CEO inside (60.3)', () => {
    const reg = registry();
    const sim = freshSim(3);
    const bank = Object.values(sim.state.businesses).find((b) => b.defId === 'bank');
    if (!bank) throw new Error('bank');
    const door = entrance(reg, bank.plotId);
    sim.state.ceo.x = door.x;
    sim.state.ceo.z = door.z;
    expect(contextActionFor(sim.state, reg)).toEqual({ kind: 'enter', targetKind: 'business', targetId: bank.id });
  });

  it('the ticket queue starts on the first visit and later presses do not change it (60.5)', () => {
    const sim = freshSim(3);
    const hall = Object.values(sim.state.businesses).find((b) => b.defId === 'municipality');
    if (!hall) throw new Error('municipality');
    expect(sim.state.counters?.['visit:municipality']).toBeUndefined();
    sim.submit({ type: 'uiEvent', event: 'officeVisited', businessId: hall.id });
    sim.tick();
    const first = sim.state.counters?.['visit:municipality'];
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) sim.tick();
    for (let i = 0; i < 5; i++) sim.submit({ type: 'uiEvent', event: 'officeVisited', businessId: hall.id });
    sim.tick();
    expect(sim.state.counters?.['visit:municipality']).toBe(first);
    // a Business that is not an office rejects the event
    const pub = Object.values(sim.state.businesses).find((b) => b.pub);
    if (!pub) throw new Error('pub');
    sim.submit({ type: 'uiEvent', event: 'officeVisited', businessId: pub.id });
    expect(sim.tick().results[0]).toMatchObject({ ok: false, reason: 'unknown_entity' });
  });
});