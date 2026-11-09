// Upright and out-of-bounds resets keep cargo (task 14.5, Requirements 13.14, 13.15).
// The web-side monitor only decides when to reset; the Simulation must move the van and nothing else.
import { describe, expect, it } from 'vitest';
import { addToStock } from '../src/storage/stock';
import type { Lot } from '../src/state/types';
import { freshSim } from './helpers';

function playerVan(sim: ReturnType<typeof freshSim>) {
  const van = Object.values(sim.state.vehicles).find((v) => v.owner === 'player');
  if (!van) throw new Error('start state has no player Vehicle');
  return van;
}

describe('resetVehicle keeps cargo (13.14, 13.15)', () => {
  it('moves the manually driven van onto the road point and leaves its cargo untouched', () => {
    const sim = freshSim(3);
    const van = playerVan(sim);
    van.control = 'manual';
    sim.state.ceo.drivingVehicleId = van.id;

    const resource = Object.keys(van.cargo)[0];
    const stock = resource ? van.cargo[resource] : undefined;
    if (!resource || !stock) throw new Error('van has no cargo stock to test with');
    const lot: Lot = { qty: 3, recipeId: null, arrivedTick: 0, origin: 'supplier' };
    addToStock(stock, lot, 1000);
    const cargoBefore = structuredClone(van.cargo);

    sim.submit({ type: 'resetVehicle', vehicleId: van.id, x: 1, z: 2, heading: 0.5 }, 'physics');
    const out = sim.tick();

    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({ ok: true });
    const after = sim.state.vehicles[van.id];
    expect(after?.cargo).toEqual(cargoBefore);
    expect(after?.pose).toMatchObject({ x: 1, z: 2, heading: 0.5, speed: 0 });
  });

  it('rejects the reset for a Vehicle that is not under manual driving', () => {
    const sim = freshSim(3);
    const van = playerVan(sim);
    sim.submit({ type: 'resetVehicle', vehicleId: van.id, x: 0, z: 0, heading: 0 }, 'physics');
    const out = sim.tick();
    expect(out.results[0]).toMatchObject({ ok: false, reason: 'vehicle_not_manual' });
  });
});
