import assert from 'node:assert/strict';
import { createGame, loadGameData } from '../../src/game';
import { FUSION_RECIPES, canFuseParents, chooseFusionOutcome, fusionBeadItemId } from '../../src/progression/fusion';
import { Rng } from '../../battle/core/src/rng';

/** Vite SSR fixtures use no browser storage and cannot alter a player's save. */
export async function runFusionAudit() {
  const catalog = await loadGameData();
  const definitions = new Map(catalog.species.map(species => [Number(species.id), species]));
  const game = createGame(structuredClone(catalog));
  const baseline = game.exportSave();
  const rows: string[] = [];
  for (const recipe of FUSION_RECIPES) {
    assert(Math.abs(recipe.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0) - 100) < 1e-10);
    let threshold = 0;
    for (const outcome of recipe.outcomes) {
      assert(definitions.has(outcome.species));
      assert.equal(definitions.get(outcome.species)!.evolves_from, null, 'Fusion hatches an infant form.');
      assert.equal(chooseFusionOutcome(recipe, threshold + outcome.weight / 200).species, outcome.species);
      threshold += outcome.weight / 100;
    }
    game.importSave(baseline);
    game.dispatch({ type: 'cheatAcquire', species: recipe.primary[0], level: 100 });
    const primary = game.snapshot().monsters.at(-1)!;
    game.dispatch({ type: 'cheatAcquire', species: recipe.secondary[0], level: 5 });
    const secondary = game.snapshot().monsters.at(-1)!;
    assert(canFuseParents(recipe, primary, secondary));
    const before = JSON.parse(game.exportSave());
    const expected = chooseFusionOutcome(recipe, new Rng(before.rng_state).next());
    const itemId = fusionBeadItemId(expected.species);
    game.dispatch({ type: 'fuse', recipeId: recipe.id, primaryUid: primary.uid, secondaryUid: secondary.uid });
    const after = JSON.parse(game.exportSave());
    assert.deepEqual(after.storage, before.storage, 'Fusion retains both parents and their training.');
    assert.deepEqual(after.party, before.party);
    assert.equal(after.game.coins, before.game.coins);
    assert.equal(after.items[itemId], 1);
    assert.equal(game.snapshot().items.find(item => item.id === itemId)?.kind, 'essence');
    const reloaded = createGame(structuredClone(catalog), game.exportSave());
    assert.equal(reloaded.snapshot().items.find(item => item.id === itemId)?.count, 1);
    const expectedHatchSpecies = expected.species;
    reloaded.dispatch({ type: 'useItem', uid: primary.uid, itemId });
    const infant = reloaded.snapshot().monsters.at(-1)!;
    assert.equal(infant.species, expectedHatchSpecies, 'Reload and hatch never reroll the fusion outcome.');
    assert.equal(infant.level, 1);
    assert.equal(reloaded.snapshot().items.some(item => item.id === itemId), false);
    reloaded.dispatch({ type: 'cheatMonster', uid: infant.uid, level: 100 });
    const form = (id: number) => definitions.get(id)!.evolution as { to: number; method: string; level?: number }[];
    let expectedFinal = infant.species;
    while (form(expectedFinal).some(evolution => evolution.method === 'level' && (evolution.level ?? 101) <= 100)) {
      expectedFinal = form(expectedFinal).find(evolution => evolution.method === 'level' && (evolution.level ?? 101) <= 100)!.to;
      reloaded.dispatch({ type: 'evolve', uid: infant.uid });
      assert.equal(reloaded.snapshot().monsters.find(monster => monster.uid === infant.uid)!.species, expectedFinal);
    }
    rows.push(recipe.id);
  }
  game.importSave(baseline);
  game.dispatch({ type: 'cheatAcquire', species: 3, level: 100 });
  game.dispatch({ type: 'cheatAcquire', species: 27, level: 5 });
  game.dispatch({ type: 'cheatAcquire', species: 10, level: 5 });
  const parents = game.snapshot().monsters.slice(3, 5);
  const invalidBefore = JSON.parse(game.exportSave());
  game.dispatch({ type: 'fuse', recipeId: 'fusion-301', primaryUid: parents[0].uid, secondaryUid: parents[0].uid });
  assert.deepEqual(JSON.parse(game.exportSave()), invalidBefore, 'Rejected pair consumes no item or RNG.');
  game.dispatch({ type: 'fuse', recipeId: 'fusion-301', primaryUid: game.snapshot().monsters[0].uid, secondaryUid: parents[1].uid });
  assert.deepEqual(JSON.parse(game.exportSave()), invalidBefore, 'An unevolved starter cannot serve as the primary.');
  game.dispatch({ type: 'fuse', recipeId: 'fusion-301', primaryUid: parents[0].uid, secondaryUid: parents[1].uid });
  game.dispatch({ type: 'useItem', uid: parents[0].uid, itemId: fusionBeadItemId(301) });
  assert.equal(game.snapshot().party.length, 6);
  assert.equal(game.snapshot().monsters.at(-1)!.inParty, false, 'A full party sends the hatched infant to storage.');
  assert(game.snapshot().species.find(species => species.id === 301)?.owned);

  for (const [recipeId, infantSpecies] of [['fusion-310', 313], ['fusion-571', 639]] as const) {
    game.importSave(baseline);
    const recipe = FUSION_RECIPES.find(entry => entry.id === recipeId)!;
    game.dispatch({ type: 'cheatAcquire', species: recipe.primary[0], level: 100 });
    const primary = game.snapshot().monsters.at(-1)!;
    game.dispatch({ type: 'cheatAcquire', species: recipe.secondary[0], level: 5 });
    const secondary = game.snapshot().monsters.at(-1)!;
    let seed = 0;
    while (chooseFusionOutcome(recipe, new Rng(seed).next()).species !== infantSpecies) seed++;
    const fixture = JSON.parse(game.exportSave());
    fixture.rng_state = new Rng(seed).s;
    game.importSave(JSON.stringify(fixture));
    game.dispatch({ type: 'fuse', recipeId, primaryUid: primary.uid, secondaryUid: secondary.uid });
    assert.equal(game.snapshot().items.find(item => item.id === fusionBeadItemId(infantSpecies))?.count, 1);
    game.importSave(game.exportSave());
    game.dispatch({ type: 'useItem', uid: primary.uid, itemId: fusionBeadItemId(infantSpecies) });
    const infant = game.snapshot().monsters.at(-1)!;
    assert.equal(infant.species, infantSpecies, 'The actual controller can persist and hatch each rare infant.');
    if (infantSpecies === 313) {
      game.dispatch({ type: 'cheatMonster', uid: infant.uid, level: 39 });
      game.dispatch({ type: 'evolve', uid: infant.uid });
      game.dispatch({ type: 'evolve', uid: infant.uid });
      assert.equal(game.snapshot().monsters.at(-1)!.species, 315, 'The rare infant evolves into Karuyeck.');
    }
  }

  const rareRates: Record<string, number> = {};
  for (const id of ['fusion-310', 'fusion-571']) {
    const recipe = FUSION_RECIPES.find(entry => entry.id === id)!;
    const rng = new Rng(17);
    let rare = 0;
    for (let trial = 0; trial < 20000; trial++) if (chooseFusionOutcome(recipe, rng.next()).rare) rare++;
    const rate = rare / 200;
    const declared = recipe.outcomes.filter(outcome => outcome.rare).reduce((sum, outcome) => sum + outcome.weight, 0);
    assert(Math.abs(rate - declared) < 1.5, 'Sampled rare outcomes follow the displayed probability.');
    rareRates[id] = rate;
  }
  const result = { recipes: rows.length, distinctInfants: new Set(FUSION_RECIPES.flatMap(recipe => recipe.outcomes.map(outcome => outcome.species))).size,
    parentRetention: true, persistedOutcome: true, fullPartyHatch: true, invalidPairUnchanged: true, evolvedForms: true, rareInfantHatch: [313, 639], karuyeckEvolution: true, rareRates };
  console.log(JSON.stringify(result));
  return result;
}
