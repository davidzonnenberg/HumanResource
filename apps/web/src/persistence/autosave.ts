// Autosave (23.1–23.3, 23.7, 21.2): every 30 s real time while Ticks advance, plus hidden,
// pagehide, Pause_Menu, speed pause and exit. Failures raise a client Alert and retry next interval.
import type { SaveDocument } from '@hr/shared';
import type { SimState } from '@hr/sim';
import type { GameLoop, SaveReason } from '../loop/GameLoop';
import { useHud } from '../store/stores';
import type { SaveRepository } from './saves';

export const AUTOSAVE_MS = 30_000;

export class Autosave {
  private timer: ReturnType<typeof setInterval> | null = null;
  private writing: Promise<void> = Promise.resolve();
  onSaved: ((doc: SaveDocument<SimState>) => void) | null = null;

  constructor(
    private readonly repo: SaveRepository,
    private readonly loop: GameLoop,
    private readonly profileId: string,
    private readonly slotId: string,
  ) {}

  start(): void {
    this.timer = setInterval(() => {
      if (!this.loop.paused) void this.save('interval');
    }, AUTOSAVE_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Serialised writes so two triggers never interleave. */
  save(_reason: SaveReason): Promise<void> {
    this.writing = this.writing.then(async () => {
      try {
        const doc = await this.repo.writeSave(this.profileId, this.slotId, this.loop.sim.state);
        useHud.getState().setClientAlert('saveFailed', null);
        if (doc) this.onSaved?.(doc);
      } catch (err) {
        console.error('[save] failed', err);
        useHud.getState().setClientAlert('saveFailed', 'alert.saveFailed');
      }
    });
    return this.writing;
  }
}

/** visibilitychange / pagehide wiring (21.1–21.4, 23.2). Returns an uninstaller. */
export function installLifecycle(loop: GameLoop, save: (r: SaveReason) => void): () => void {
  const onVis = () => {
    if (document.visibilityState === 'hidden') {
      loop.pause('hidden'); // also requests a save via the loop hook
    } else {
      loop.resume('hidden'); // Ticks resume only if no other pause reason remains (21.4)
    }
  };
  const onHide = () => save('pagehide');
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onHide);
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', onHide);
  };
}
