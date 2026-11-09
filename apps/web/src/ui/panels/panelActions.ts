// Panel -> Command helpers. All go through the Simulation; rejections already surface as toasts.
import { bridge } from '../../store/simBridge';
import type { RouteStopInput } from '@hr/sim';

const sim = () => bridge.loop?.sim ?? null;

export function hire(): void {
  sim()?.submit({ type: 'hire' });
}

export function fire(humanId: string): void {
  sim()?.submit({ type: 'fire', humanId });
}

export function assign(humanId: string, target: { kind: 'business' | 'vehicle'; id: string; slotId: string }): void {
  sim()?.submit({ type: 'assign', humanId, target });
}

export function unassign(humanId: string): void {
  sim()?.submit({ type: 'unassign', humanId });
}

export function setDrinkPrice(businessId: string, price: number): void {
  sim()?.submit({ type: 'setDrinkPrice', businessId, price });
}

export function placeOrder(supplierId: string, destinationId: string, resourceId: string, quantity: number): void {
  sim()?.submit({ type: 'placeOrder', supplierId, destinationId, resourceId, quantity });
}

export function setAutoReorder(businessId: string, resourceId: string, enabled: boolean, threshold: number): void {
  sim()?.submit({ type: 'setAutoReorder', businessId, resourceId, enabled, threshold });
}

export function setRoute(vehicleId: string, stops: RouteStopInput[]): void {
  sim()?.submit({ type: 'setRoute', vehicleId, stops });
}

export function resumeRoute(vehicleId: string): void {
  sim()?.submit({ type: 'resumeRoute', vehicleId });
}
