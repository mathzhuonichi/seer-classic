/** Source-declared infant rewards, legacy essence inventories, and route consistency. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { memoryStorage, withSsr } from './_harness.mjs';

memoryStorage();
await withSsr('boss-essence-targets', async load => {
  const { createGame } = await load('/src/kernel/game.ts');
  const { loadCatalog } = await load('/src/domain/catalog/catalog.ts');
  const { buildAcquisitionIndex } = await load('/src/domain/acquisition/acquisition.ts');
  const { bossEssenceRewards } = await load('/src/domain/acquisition/native-acquisition.ts');
  const { buildInitialFormAcquisitionIndex } = await load('/src/domain/acquisition/initial-acquisition.ts');
  const { CHALLENGE_CAMPAIGNS } = await load('/src/domain/challenges/challenge-campaigns.ts');
  const catalog = await loadCatalog(), originalCatalog = JSON.stringify(catalog);
  const byId = new Map(catalog.species.map(species => [species.id, species]));
  const declaredRewards = catalog.bosses.filter(boss => boss.reward?.monster);
  assert.equal(declaredRewards.length, 25, 'Exercise every recovered monster-reward encounter.');
  const index = buildAcquisitionIndex(catalog);
  const initial = buildInitialFormAcquisitionIndex(catalog, index);
  const base = JSON.parse(createGame(catalog, '').exportSave());
  base.rng_state = [101, 202, 303, 404];

  function hatchLegacyEssence(boss, itemId, expected) {
    const legacy = structuredClone(base);
    legacy.progress.bosses_cleared = [boss.id];
    legacy.items[itemId] = 1;
    legacy.game.shopUnlocked = [];
    const game = createGame(catalog, JSON.stringify(legacy));
    assert.equal(game.snapshot().items.find(item => item.id === itemId)?.name, `${byId.get(expected).name.zh}精元`, `${boss.id}: inventory target name`);
    assert.equal(game.snapshot().shopItems.find(item => item.id === itemId)?.hatches, expected, `${boss.id}: earned shop target`);
    const before = JSON.parse(game.exportSave());
    game.dispatch({ type: 'useItem', itemId, uid: game.snapshot().party[0] });
    const after = JSON.parse(game.exportSave());
    const acquired = after.storage.filter(mon => !before.storage.some(old => old.uid === mon.uid));
    assert.equal(acquired.length, 1, `${boss.id}: hatching creates one creature`);
    assert.equal(acquired[0].species, expected, `${boss.id}: hatch the declared infant`);
    assert.equal(acquired[0].level, 1, `${boss.id}: hatch at level one`);
    assert.equal(after.items[itemId] ?? 0, 0, `${boss.id}: consume one essence`);
    assert.deepEqual(after.storage.filter(mon => mon.uid !== acquired[0].uid), before.storage, `${boss.id}: preserve existing creatures`);
    const restored = createGame(catalog, game.exportSave());
    assert.equal(restored.snapshot().monsters.find(mon => mon.uid === acquired[0].uid)?.species, expected, `${boss.id}: reload preserves infant`);
    assert.equal(restored.snapshot().shopItems.find(item => item.id === itemId)?.hatches, expected, `${boss.id}: consumed essence stays replenishable`);
    return restored;
  }

  for (const boss of declaredRewards) {
    const expected = boss.reward.monster.species;
    const route = index.get(expected)?.routes.find(route => route.kind === 'boss' && route.bossId === boss.id);
    assert.ok(route, `${boss.id}: declared infant needs an executable encyclopedia route`);
    assert.equal(route.entrySpecies, expected);
    assert.ok(route.label.includes(byId.get(expected).name.zh));
    assert.ok(initial.get(expected)?.initialForms.some(form => form.species === expected && form.routes.some(route => route.bossId === boss.id)), `${boss.id}: initial-form locate action`);
    assert.ok(!index.get(boss.team.at(-1).species)?.routes.some(route => route.kind === 'boss' && route.bossId === boss.id), `${boss.id}: no direct adult reward`);
    assert.ok(index.get(boss.team.at(-1).species)?.routes.some(route => route.kind === 'evolution' && route.bossId === boss.id), `${boss.id}: defeated adult remains obtainable through implemented evolution`);
    const game = hatchLegacyEssence(boss, `essence_${boss.id}`, expected);
    if (expected === 1220) {
      const infant = game.snapshot().monsters.find(mon => mon.species === 1220);
      game.dispatch({ type: 'cheatMonster', uid: infant.uid, level: 39 });
      const underLevel = game.exportSave();
      game.dispatch({ type: 'evolve', uid: infant.uid });
      assert.equal(game.exportSave(), underLevel, 'Bojiesi cannot evolve below the source minimum level.');
      game.dispatch({ type: 'useItem', uid: infant.uid, itemId: 'item_level_up_1' });
      assert.equal(game.snapshot().monsters.find(mon => mon.uid === infant.uid).level, 40, 'Normal training reaches the source level threshold.');
      assert.equal(game.snapshot().monsters.find(mon => mon.uid === infant.uid).species, 1221, 'Bojiesi evolves automatically at level 40 under the ordinary mechanical rule.');
      const adultRoute = index.get(1221)?.routes.find(route => route.kind === 'evolution' && route.bossId === boss.id);
      assert.ok(adultRoute, 'Correcting the infant reward preserves Bokate obtainability.');
      assert.deepEqual(adultRoute.evolutionChain, [{ from: 1220, to: 1221, level: 40 }]);
      assert.ok(initial.get(1221).initialForms.some(form => form.species === 1220 && form.evolutionPath.every(step => step.implemented && step.automatic === true)));
      const restored = createGame(catalog, game.exportSave());
      assert.equal(restored.snapshot().monsters.find(mon => mon.uid === infant.uid).species, 1221, 'Automatic evolution and instance identity survive reload.');
      for (const species of [1220, 1221]) assert.ok(restored.snapshot().species.find(mon => mon.id === species).owned, 'Both forms remain registered.');
    }
  }

  const sourceInfant = JSON.parse(fs.readFileSync('data/monsters/1220.json', 'utf8'));
  assert.deepEqual(byId.get(1220), sourceInfant, 'Standalone and runtime species records agree.');
  assert.deepEqual(sourceInfant.evolution, [{ to: 1221, method: 'level', level: 40, automatic: true }]);
  const catalogIndex = JSON.parse(fs.readFileSync('data/catalog_index.json', 'utf8'));
  assert.deepEqual(catalogIndex.monsters.find(mon => mon.id === 1220).evolves_to, [1221], 'Catalog index preserves the same forward edge.');

  // Every encounter essence hatches an initial form at Lv1, as the original 分子转化器 did; the line's other forms follow by evolution.
  const essences = bossEssenceRewards(catalog);
  const lowerForms = essences.filter(reward => initial.get(reward.species).initialForms.some(form => form.species !== reward.species));
  assert.deepEqual(lowerForms.map(reward => `${reward.boss.id} -> ${reward.species}`), [], 'no essence hatches a form that evolves from another');
  // A defeated final form with no bound essence pays its line's initial form; the rematches whose source pays only a title stay paid.
  const initialOf = species => {
    const forms = initial.get(species).initialForms;
    assert.equal(forms.length, 1, `${species}: one initial form`);
    return forms[0].species;
  };
  const authoredFallbacks = { boss_spt_kelaifen2: 854, boss_spt_kelanite2: 536, boss_dark_trial_katesi: 167 };
  for (const [bossId, species] of Object.entries(authoredFallbacks)) {
    const boss = catalog.bosses.find(entry => entry.id === bossId);
    assert.deepEqual(essences.filter(reward => reward.boss.id === bossId).map(reward => [reward.itemId, reward.species, reward.authored]),
      [[`essence_${bossId}`, initialOf(boss.team.at(-1).species), true]], `${bossId}: the remake essence hatches the initial form`);
    assert.equal(species, initialOf(boss.team.at(-1).species));
  }
  assert.deepEqual(essences.filter(reward => reward.boss.id === 'boss_gaia').map(reward => reward.species), [260], '盖亚精元 hatches 提坦');

  // Existing explicit bindings retain their targets; final-enemy fallbacks hatch the line's initial form.
  const explicit = catalog.bosses.find(boss => boss.id === 'boss_spt_liaosi');
  hatchLegacyEssence(explicit, 'essence_liaosi', explicit.reward_hatches);
  const fallback = catalog.bosses.find(boss => !boss.reward_hatches && !boss.reward?.monster && !boss.reward?.learn_skill
    && !Object.keys(boss.reward?.items ?? {}).some(id => id.startsWith('essence_'))
    && boss.id !== 'boss_tower_brave_mystery' && !CHALLENGE_CAMPAIGNS.some(campaign => campaign.stages.some(stage => stage.bossIds.includes(boss.id))));
  assert.ok(fallback);
  hatchLegacyEssence(fallback, `essence_${fallback.id}`, initialOf(fallback.team.at(-1).species));
  const bound = { id: 'boss_fixture', team: [{ species: 9 }], reward_hatches: 1, reward: { monster: { species: 4 } } };
  assert.deepEqual(bossEssenceRewards({ species: [], bosses: [bound], items: [] }).map(reward => reward.species), [1], 'Explicit hatch binding remains authoritative.');

  // Campaign stages must still withhold synthetic essences until their final stage.
  for (const campaign of CHALLENGE_CAMPAIGNS) {
    const intermediates = campaign.stages.slice(0, -1).flatMap(stage => stage.bossIds);
    const legacy = structuredClone(base);
    for (const id of intermediates) legacy.items[`essence_${id}`] = 1;
    const game = createGame(catalog, JSON.stringify(legacy));
    for (const id of intermediates) assert.ok(!game.snapshot().items.some(item => item.id === `essence_${id}`), `${id}: no synthetic intermediate essence`);
  }
  const finalBoss = catalog.bosses.find(boss => boss.id === 'boss_puni_zhenshen');
  hatchLegacyEssence(finalBoss, 'essence_puni', finalBoss.reward_hatches);

  // Exercise one actual victory-to-reload-to-hatch transaction. Only the fixture's
  // player attack is strengthened; the original encounter and reward are intact.
  const battleCatalog = structuredClone(catalog);
  const attack = battleCatalog.skills.find(skill => skill.id === 10001);
  Object.assign(attack, { power: 1000000, accuracy: null, priority: 20 });
  const battleSave = structuredClone(base);
  battleSave.game.traits = {};
  const game = createGame(battleCatalog, JSON.stringify(battleSave));
  game.dispatch({ type: 'cheatMonster', uid: game.snapshot().party[0], level: 100 });
  game.dispatch({ type: 'startBattle', bossId: 'boss_spt_ajiasha' });
  game.dispatch({ type: 'move', skillId: 10001 });
  assert.equal(game.snapshot().battle?.won, true, 'Actual battle settlement awards the essence.');
  game.dispatch({ type: 'closeBattle' });
  const restored = createGame(catalog, game.exportSave());
  const before = restored.snapshot().monsters.length;
  restored.dispatch({ type: 'useItem', itemId: 'essence_boss_spt_ajiasha', uid: restored.snapshot().party[0] });
  assert.deepEqual(restored.snapshot().monsters.slice(before).map(mon => [mon.species, mon.level]), [[1060, 1]]);
  assert.equal(JSON.stringify(catalog), originalCatalog, 'Controllers and fixture preserve the caller catalog.');
  console.log(JSON.stringify({ declaredInfantRewards: declaredRewards.length, checks: ['encyclopedia initial routes', 'legacy earned essence hatch and reload', 'inventory and replenishable shop targets', 'Bojiesi level-40 automatic evolution through normal training and reload', 'three catalog outputs agree', 'every essence hatches an initial form', 'existing explicit and fallback bindings', 'campaign intermediate and final rewards', 'actual victory settlement', 'catalog immutability'] }));
});
