// Battle options exactly as the game builds them, for suites that drive game battles turn by turn themselves.
import assert from 'node:assert/strict';

/**
 * Loads the controller through `load` (withSsr) and returns `optionsFor(start)`: the options `createGame` builds
 * for the start action `start`, from a seeded save whose party is the three starter lines at Lv 100.
 */
export async function gameBattleOptions(load) {
  const [{createGame, loadCatalog}, {newSave}, {Battle}] = await Promise.all(['/src/kernel/game.ts', '/src/kernel/save.ts', '/battle/core/src/index.ts'].map(load));
  const catalog = await loadCatalog();
  return start => {
    let options;
    const game = createGame(catalog, JSON.stringify(newSave(58)), {createBattle: built => new Battle(options = built)});
    for (const species of [3, 6, 9]) game.dispatch({type: 'cheatAcquire', species, level: 100});
    for (const mon of game.snapshot().monsters) game.dispatch({type: 'cheatMonster', uid: mon.uid, iv: 31});
    const result = game.dispatch(start);
    assert(result.ok && options, `${start.type}: ${result.notice}`);
    return options;
  };
}
