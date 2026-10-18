// Game battles for the suites: a levelled controller, and battle options exactly as the game builds them.
import assert from 'node:assert/strict';

/**
 * Loads the controller through `load` (withSsr) and returns `levelled(dependencies)`: a controller (createGame with
 * `dependencies`) on a seeded save whose party is the three starter lines at Lv 100 with IV 31.
 */
export async function levelledGames(load) {
  const [{createGame}, {loadCatalog}, {newSave}] = await Promise.all(
    ['/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/kernel/save.ts'].map(load));
  const catalog = await loadCatalog();
  return dependencies => {
    const game = createGame(catalog, JSON.stringify(newSave(58)), dependencies);
    for (const species of [3, 6, 9]) game.dispatch({type: 'cheatAcquire', species, level: 100});
    for (const mon of game.snapshot().monsters) game.dispatch({type: 'cheatMonster', uid: mon.uid, iv: 31});
    return game;
  };
}

/** Returns `optionsFor(start)`: the options a levelled controller builds for the start action `start`. */
export async function gameBattleOptions(load) {
  const [levelled, {Battle}] = await Promise.all([levelledGames(load), load('/battle/core/src/index.ts')]);
  return start => {
    let options;
    // The suite plays its own battle from the options, so the controller's turn preparation never runs.
    const game = levelled({createBattle: built => new Battle(options = built), idle: () => {}});
    const result = game.dispatch(start);
    assert(result.ok && options, `${start.type}: ${result.notice}`);
    return options;
  };
}
