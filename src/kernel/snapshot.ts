// The immutable snapshot the components render: the union of the registered features' slices.
import type { GameSnapshot } from './contract.ts';
import type { GameContext } from './context.ts';
import type { Runtime } from './api.ts';
import { FEATURES } from './features.ts';
import { reuseUnchanged } from './structural-sharing.ts';

/**
 * Builds a snapshot function from every feature's slice builder. Every slice and row that equals the previous snapshot's keeps
 * its identity. The snapshot object itself is new on every build, because a screen may also read controller state that no slice
 * carries (`engravingOptions`).
 */
export function createSnapshotBuilder(ctx: GameContext): (rt: Runtime) => GameSnapshot {
  const slices = FEATURES.flatMap(feature => feature.slice ? [feature.slice(ctx)] : []);
  let previous: GameSnapshot | undefined;
  return rt => {
    const parts = slices.map(slice => slice(rt)), next = Object.assign({}, ...parts) as GameSnapshot;
    if (!previous && Object.keys(next).length !== parts.reduce((count, part) => count + Object.keys(part).length, 0)) {
      throw new Error('two features build the same snapshot field');
    }
    previous = previous ? { ...reuseUnchanged(previous, next) } : next;
    return previous;
  };
}
