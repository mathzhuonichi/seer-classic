// The game controller: one catalog, one save, and the snapshot the components render.
import { serialize } from './save.ts';
import { loadCatalog, type CatalogData } from '../domain/catalog/catalog.ts';
import type { GameController, GameSnapshot } from './contract.ts';
import { createGameContext, type GameDependencies } from './context.ts';
import { runAction } from './dispatch.ts';
import {engravingOptions} from '../features/engravings/index.ts';
import { notice, type Runtime } from './api.ts';
import { loadJourney, openJourney, startJourney, writeJourney, type Journey } from './save-state.ts';
import { createSnapshotBuilder } from './snapshot.ts';

export { loadCatalog };

export function createGame(catalog: CatalogData, initialSave?: string, dependencies: GameDependencies = {}): GameController {
  const ctx = createGameContext(catalog, dependencies);
  const opened = openJourney(ctx, initialSave);
  const rt: Runtime = { ctx, save: opened.save, rng: opened.rng, session: null, notices: opened.notices, animation: { revision: 0, frameId: 0 } };
  const build = createSnapshotBuilder(ctx), listeners = new Set<() => void>();
  // An explicit import or new journey is the player's choice to replace the stored save.
  let durable = opened.durable;
  const adopt = (journey: Journey) => { rt.save = journey.save; rt.rng = journey.rng; rt.session = null; durable = true; };
  const publish = () => { writeJourney(ctx, rt, durable); cached = build(rt); };
  const emit = () => { publish(); listeners.forEach(listener => listener()); };
  let cached: GameSnapshot;
  publish();
  return {
    snapshot: () => cached,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    dispatch: action => { const result = runAction(rt, action); emit(); return result; },
    engravingOptions: uid => engravingOptions(ctx, rt.save, uid),
    exportSave: () => serialize(rt.save),
    importSave: text => { adopt(loadJourney(ctx, text)); notice(rt, '存档已导入。'); emit(); },
    reset: () => { adopt(startJourney(ctx)); rt.notices = ['新旅程已开始。']; emit(); },
  };
}
