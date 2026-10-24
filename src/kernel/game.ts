// A game kept in memory: one catalog, one save. The player's saved games are opened by the save library (save-library.ts).
import type { CatalogData } from '../domain/catalog/catalog.ts';
import type { GameController } from './contract.ts';
import { createGameContext, type GameDependencies } from './context.ts';
import { runGame } from './controller.ts';
import { loadJourney, startJourney } from './save-state.ts';

/** The game of `initialSave` (an unreadable one throws), or of a new journey when it is absent or empty; nothing is written. */
export function createGame(catalog: CatalogData, initialSave?: string, dependencies: GameDependencies = {}): GameController {
  const ctx = createGameContext(catalog, dependencies);
  return runGame(ctx, initialSave ? loadJourney(ctx, initialSave) : startJourney(ctx), null);
}
