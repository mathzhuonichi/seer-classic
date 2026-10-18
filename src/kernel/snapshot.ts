// The immutable snapshot the components render: the union of the registered features' slices.
import type { GameSnapshot } from './contract.ts';
import type { GameContext } from './context.ts';
import type { Runtime } from './api.ts';
import { FEATURES } from './features.ts';
import { fieldSharing } from './structural-sharing.ts';

/**
 * Builds a snapshot function from every feature's slice builder. Every slice and row that equals the previous snapshot's keeps
 * its identity, and so does the snapshot itself when nothing changed: what screens read beside it, `engravingOptions`, changes
 * only with the monsters and engravingStock slices. A field that its builder returns unchanged from a memo is not compared again.
 */
export function createSnapshotBuilder(ctx: GameContext): (rt: Runtime) => GameSnapshot {
  const slices = FEATURES.flatMap(feature => feature.slice ? [feature.slice(ctx)] : []), share = fieldSharing<GameSnapshot>();
  let checked = false;
  return rt => {
    const parts = slices.map(slice => slice(rt)), next = Object.assign({}, ...parts) as GameSnapshot;
    if (!checked && Object.keys(next).length !== parts.reduce((count, part) => count + Object.keys(part).length, 0)) {
      throw new Error('two features build the same snapshot field');
    }
    checked = true;
    return share(next);
  };
}
