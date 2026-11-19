// Migration v2 -> v3: adds the savings account (`player.savings`) used by the bank app.
//
// Pure JSON function over a locally typed shape; it never imports game types.
import type { Migration } from './index';

interface V2State {
  player?: { savings?: number; [key: string]: unknown };
  [key: string]: unknown;
}

export const v2ToV3: Migration = {
  from: 2,
  to: 3,
  name: 'v2_to_v3_savings',
  up(doc) {
    const state = doc.state as V2State | undefined;
    if (!state || typeof state !== 'object' || !state.player || typeof state.player !== 'object') throw new Error('save has no player');
    if (state.player.savings === undefined) state.player.savings = 0;
    return doc;
  },
};
