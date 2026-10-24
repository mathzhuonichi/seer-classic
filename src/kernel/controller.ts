// The controller of one journey: its runtime, its save writer and the snapshot the components render.
import type { GameController, GameSnapshot } from './contract.ts';
import type { GameContext } from './context.ts';
import { runAction } from './dispatch.ts';
import {engravingOptions} from '../features/engravings/index.ts';
import { notice, type Runtime } from './api.ts';
import { createJourneyWriter, loadJourney, startJourney, type Journey, type JourneySlot } from './save-state.ts';
import { createSnapshotBuilder } from './snapshot.ts';

/** The controller of `journey`, written to `slot` (save-library.ts) when there is one, showing `notices`. */
export function runGame(ctx: GameContext, journey: Journey, slot: JourneySlot | null, notices: string[] = []): GameController {
  const rt: Runtime = { ctx, save: journey.save, rng: journey.rng, session: null, notices, animation: { revision: 0, frameId: 0 } };
  const build = createSnapshotBuilder(ctx), listeners = new Set<() => void>(), writer = createJourneyWriter(ctx, rt, slot);
  // An explicit import or new journey is the player's choice to replace the slot's save.
  const adopt = (journey: Journey) => { rt.save = journey.save; rt.rng = journey.rng; rt.session = null; writer.replaced(); };
  const emit = () => { cached = build(rt); listeners.forEach(listener => listener()); };
  let cached: GameSnapshot = build(rt);
  return {
    snapshot: () => cached,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch: action => { const result = runAction(rt, action); writer.changed(); emit(); return result; },
    engravingOptions: uid => engravingOptions(ctx, rt.save, uid),
    exportSave: () => writer.flush(),
    importSave: text => { adopt(loadJourney(ctx, text)); notice(rt, '存档已导入。'); emit(); },
    reset: () => { adopt(startJourney(ctx)); rt.notices = ['新旅程已开始。']; emit(); },
  };
}
