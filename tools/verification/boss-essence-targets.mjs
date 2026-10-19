/** Source-declared infant rewards, legacy essence inventories, route consistency, and first-clear reward items. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { memoryStorage, withSsr } from './_harness.mjs';

/** The checks this suite reports, in the order it runs them. */
const CHECK_NAMES = [
  'encyclopedia initial routes', 'legacy earned essence hatch and reload', 'inventory and replenishable shop targets',
  'Bojiesi level-40 automatic evolution through normal training and reload', 'three catalog outputs agree',
  'every essence hatches an initial form', 'existing explicit and fallback bindings', 'campaign intermediate and final rewards',
  'actual victory settlement', 'first-clear collectible', 'version-2 retired essence and suit', 'catalog immutability',
];

/** What every check reads: the controller, the catalog as loaded, its acquisition indexes and a fresh save with a fixed RNG. */
async function loadFixture(load) {
  const { createGame } = await load('/src/kernel/game.ts');
  const { loadCatalog } = await load('/src/domain/catalog/catalog.ts');
  const { buildAcquisitionIndex } = await load('/src/domain/acquisition/acquisition.ts');
  const { bossEssenceRewards } = await load('/src/domain/acquisition/native-acquisition.ts');
  const { buildInitialFormAcquisitionIndex } = await load('/src/domain/acquisition/initial-acquisition.ts');
  const { CHALLENGE_CAMPAIGNS } = await load('/src/domain/challenges/challenge-campaigns.ts');
  const catalog = await loadCatalog(), originalCatalog = JSON.stringify(catalog);
  const byId = new Map(catalog.species.map(species => [species.id, species]));
  const index = buildAcquisitionIndex(catalog);
  const initial = buildInitialFormAcquisitionIndex(catalog, index);
  const base = JSON.parse(createGame(catalog, '').exportSave());
  base.rng_state = [101, 202, 303, 404];
  return { createGame, bossEssenceRewards, CHALLENGE_CAMPAIGNS, catalog, originalCatalog, byId, index, initial, base };
}

/** A save that earned `boss`'s essence before essences were listed hatches `expected` from it, and the hatch survives a reload. */
function hatchLegacyEssence({ createGame, catalog, byId, base }, boss, itemId, expected) {
  const legacy = structuredClone(base);
  legacy.progress.bosses_cleared = [boss.id];
  legacy.items[itemId] = 1;
  legacy.game.shopUnlocked = [];
  const game = createGame(catalog, JSON.stringify(legacy));
  const name = `${byId.get(expected).name.zh}精元`;
  assert.equal(game.snapshot().items.find(item => item.id === itemId)?.name, name, `${boss.id}: inventory target name`);
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
  const listing = restored.snapshot().shopItems.find(item => item.id === itemId);
  assert.equal(listing?.hatches, expected, `${boss.id}: consumed essence stays replenishable`);
  return restored;
}

/** The single initial form of `species`'s line. */
function initialOf({ initial }, species) {
  const forms = initial.get(species).initialForms;
  assert.equal(forms.length, 1, `${species}: one initial form`);
  return forms[0].species;
}

/** Every recovered monster-reward encounter hatches its declared infant, with a dex route to it and none to the adult it fought. */
function checkDeclaredInfantRewards(fixture) {
  const { catalog, byId, index, initial } = fixture;
  const declaredRewards = catalog.bosses.filter(boss => boss.reward?.monster);
  assert.equal(declaredRewards.length, 25, 'Exercise every recovered monster-reward encounter.');
  for (const boss of declaredRewards) {
    const expected = boss.reward.monster.species, adult = boss.team.at(-1).species;
    const route = index.get(expected)?.routes.find(route => route.kind === 'boss' && route.bossId === boss.id);
    assert.ok(route, `${boss.id}: declared infant needs an executable encyclopedia route`);
    assert.equal(route.entrySpecies, expected);
    assert.ok(route.label.includes(byId.get(expected).name.zh));
    const forms = initial.get(expected)?.initialForms ?? [];
    assert.ok(forms.some(form => form.species === expected && form.routes.some(route => route.bossId === boss.id)), `${boss.id}: initial-form locate action`);
    const adultRoutes = index.get(adult)?.routes ?? [];
    assert.ok(!adultRoutes.some(route => route.kind === 'boss' && route.bossId === boss.id), `${boss.id}: no direct adult reward`);
    assert.ok(adultRoutes.some(route => route.kind === 'evolution' && route.bossId === boss.id),
      `${boss.id}: defeated adult remains obtainable through implemented evolution`);
    const game = hatchLegacyEssence(fixture, boss, `essence_${boss.id}`, expected);
    if (expected === 1220) checkBojiesiEvolution(fixture, game, boss);
  }
  return declaredRewards.length;
}

/** 波杰斯 (1220), hatched from its essence, evolves into 波卡特 (1221) at Lv40 through ordinary training, and keeps it on reload. */
function checkBojiesiEvolution({ createGame, catalog, index, initial }, game, boss) {
  const infant = game.snapshot().monsters.find(mon => mon.species === 1220);
  const monster = () => game.snapshot().monsters.find(mon => mon.uid === infant.uid);
  game.dispatch({ type: 'cheatMonster', uid: infant.uid, level: 39 });
  const underLevel = game.exportSave();
  game.dispatch({ type: 'evolve', uid: infant.uid });
  assert.equal(game.exportSave(), underLevel, 'Bojiesi cannot evolve below the source minimum level.');
  game.dispatch({ type: 'useItem', uid: infant.uid, itemId: 'item_level_up_1' });
  assert.equal(monster().level, 40, 'Normal training reaches the source level threshold.');
  assert.equal(monster().species, 1221, 'Bojiesi evolves automatically at level 40 under the ordinary mechanical rule.');
  const adultRoute = index.get(1221)?.routes.find(route => route.kind === 'evolution' && route.bossId === boss.id);
  assert.ok(adultRoute, 'Correcting the infant reward preserves Bokate obtainability.');
  assert.deepEqual(adultRoute.evolutionChain, [{ from: 1220, to: 1221, level: 40 }]);
  const automatic = form => form.species === 1220 && form.evolutionPath.every(step => step.implemented && step.automatic === true);
  assert.ok(initial.get(1221).initialForms.some(automatic));
  const restored = createGame(catalog, game.exportSave());
  const evolved = restored.snapshot().monsters.find(mon => mon.uid === infant.uid);
  assert.equal(evolved.species, 1221, 'Automatic evolution and instance identity survive reload.');
  for (const species of [1220, 1221]) assert.ok(restored.snapshot().species.find(mon => mon.id === species).owned, 'Both forms remain registered.');
}

/** The standalone species file, the runtime catalog and the catalog index agree on 波杰斯's record and its evolution. */
function checkCatalogOutputsAgree({ byId }) {
  const sourceInfant = JSON.parse(fs.readFileSync('data/monsters/1220.json', 'utf8'));
  assert.deepEqual(byId.get(1220), sourceInfant, 'Standalone and runtime species records agree.');
  assert.deepEqual(sourceInfant.evolution, [{ to: 1221, method: 'level', level: 40, automatic: true }]);
  const catalogIndex = JSON.parse(fs.readFileSync('data/catalog_index.json', 'utf8'));
  assert.deepEqual(catalogIndex.monsters.find(mon => mon.id === 1220).evolves_to, [1221], 'Catalog index preserves the same forward edge.');
}

/**
 * Every encounter essence hatches an initial form at Lv1, as the original 分子转化器 did; the line's other forms follow by evolution.
 * A defeated final form with no bound essence pays its line's initial form; the rematches whose source pays only a title stay paid.
 */
function checkEssencesHatchInitialForms(fixture) {
  const { catalog, initial } = fixture, essences = fixture.bossEssenceRewards(catalog);
  const lowerForms = essences.filter(reward => initial.get(reward.species).initialForms.some(form => form.species !== reward.species));
  assert.deepEqual(lowerForms.map(reward => `${reward.boss.id} -> ${reward.species}`), [], 'no essence hatches a form that evolves from another');
  const authoredFallbacks = { boss_spt_kelaifen2: 854, boss_spt_kelanite2: 536, boss_dark_trial_katesi: 167 };
  for (const [bossId, species] of Object.entries(authoredFallbacks)) {
    const boss = catalog.bosses.find(entry => entry.id === bossId), hatches = initialOf(fixture, boss.team.at(-1).species);
    assert.deepEqual(essences.filter(reward => reward.boss.id === bossId).map(reward => [reward.itemId, reward.species, reward.authored]),
      [[`essence_${bossId}`, hatches, true]], `${bossId}: the remake essence hatches the initial form`);
    assert.equal(species, hatches);
  }
  assert.deepEqual(essences.filter(reward => reward.boss.id === 'boss_gaia').map(reward => reward.species), [260], '盖亚精元 hatches 提坦');
}

/** Existing explicit bindings retain their targets; final-enemy fallbacks hatch the line's initial form. */
function checkExplicitAndFallbackBindings(fixture) {
  const { catalog, CHALLENGE_CAMPAIGNS } = fixture;
  const explicit = catalog.bosses.find(boss => boss.id === 'boss_spt_liaosi');
  hatchLegacyEssence(fixture, explicit, 'essence_liaosi', explicit.reward_hatches);
  const campaignStage = id => CHALLENGE_CAMPAIGNS.some(campaign => campaign.stages.some(stage => stage.bossIds.includes(id)));
  const fallback = catalog.bosses.find(boss => !boss.reward_hatches && !boss.reward?.monster && !boss.reward?.learn_skill
    && !Object.keys(boss.reward?.items ?? {}).some(id => id.startsWith('essence_'))
    && boss.id !== 'boss_tower_brave_mystery' && !campaignStage(boss.id));
  assert.ok(fallback);
  hatchLegacyEssence(fixture, fallback, `essence_${fallback.id}`, initialOf(fixture, fallback.team.at(-1).species));
  const bound = { id: 'boss_fixture', team: [{ species: 9 }], reward_hatches: 1, reward: { monster: { species: 4 } } };
  assert.deepEqual(fixture.bossEssenceRewards({ species: [], bosses: [bound], items: [] }).map(reward => reward.species), [1],
    'Explicit hatch binding remains authoritative.');
}

/** Campaign stages must still withhold synthetic essences until their final stage. */
function checkCampaignRewards(fixture) {
  const { createGame, catalog, base, CHALLENGE_CAMPAIGNS } = fixture;
  for (const campaign of CHALLENGE_CAMPAIGNS) {
    const intermediates = campaign.stages.slice(0, -1).flatMap(stage => stage.bossIds);
    const legacy = structuredClone(base);
    for (const id of intermediates) legacy.items[`essence_${id}`] = 1;
    const game = createGame(catalog, JSON.stringify(legacy));
    for (const id of intermediates) {
      assert.ok(!game.snapshot().items.some(item => item.id === `essence_${id}`), `${id}: no synthetic intermediate essence`);
    }
  }
  const finalBoss = catalog.bosses.find(boss => boss.id === 'boss_puni_zhenshen');
  hatchLegacyEssence(fixture, finalBoss, 'essence_puni', finalBoss.reward_hatches);
}

/** A catalog and save for real victories: only the fixture's player attack is strengthened; the encounters and rewards are intact. */
function battleFixture({ catalog, base }) {
  const battleCatalog = structuredClone(catalog);
  const attack = battleCatalog.skills.find(skill => skill.id === 10001);
  Object.assign(attack, { power: 1000000, accuracy: null, priority: 20 });
  const battleSave = structuredClone(base);
  battleSave.game.traits = {};
  return { battleCatalog, battleSave: JSON.stringify(battleSave) };
}

/** One actual victory-to-reload-to-hatch transaction. */
function checkVictorySettlement({ createGame, catalog }, { battleCatalog, battleSave }) {
  const game = createGame(battleCatalog, battleSave);
  game.dispatch({ type: 'cheatMonster', uid: game.snapshot().party[0], level: 100 });
  game.dispatch({ type: 'startBattle', bossId: 'boss_spt_ajiasha' });
  game.dispatch({ type: 'move', skillId: 10001 });
  assert.equal(game.snapshot().battle?.won, true, 'Actual battle settlement awards the essence.');
  game.dispatch({ type: 'closeBattle' });
  const restored = createGame(catalog, game.exportSave());
  const before = restored.snapshot().monsters.length;
  restored.dispatch({ type: 'useItem', itemId: 'essence_boss_spt_ajiasha', uid: restored.snapshot().party[0] });
  assert.deepEqual(restored.snapshot().monsters.slice(before).map(mon => [mon.species, mon.level]), [[1060, 1]]);
}

/** 里奥斯's first clear pays the 蓝武士装 once, as a collectible that only the clear gives, like Brave Tower's 闪光套装. */
function checkFirstClearCollectible({ createGame }, { battleCatalog, battleSave }) {
  const suit = 'suit_blue_warrior', liaosi = createGame(battleCatalog, battleSave);
  liaosi.dispatch({ type: 'cheatMonster', uid: liaosi.snapshot().party[0], level: 100 });
  for (const clear of ['first', 'repeat']) {
    liaosi.dispatch({ type: 'heal' });
    const before = JSON.parse(liaosi.exportSave());
    liaosi.dispatch({ type: 'startBattle', bossId: 'boss_spt_liaosi' });
    liaosi.dispatch({ type: 'move', skillId: 10001 });
    const { won, result } = liaosi.snapshot().battle ?? {};
    assert.equal(won, true, `${clear} 里奥斯 clear`);
    liaosi.dispatch({ type: 'closeBattle' });
    const after = JSON.parse(liaosi.exportSave()), coins = after.game.coins - before.game.coins, exp = after.exp_pool - before.exp_pool;
    assert.equal(after.items[suit], 1, `${clear} clear: one 蓝武士装 in all`);
    // The result names the essence by the creature it hatches, then what the win paid: 500 beans, the pooled experience and,
    // on the first clear only, the suit.
    assert.equal(coins, 500, `${clear} clear: an SPT Boss pays 500 beans`);
    assert.ok(exp > 0, `${clear} clear: the win adds pooled experience`);
    const paid = `获得 ${coins} 赛尔豆及 ${exp} 积累经验${clear === 'first' ? '，另获得蓝武士装' : ''}。`;
    assert.equal(result, `胡里亚精元已入库，到道具背包的精元页即可孵化。${paid}`, `${clear} clear: result text`);
  }
  const held = liaosi.snapshot().items.filter(item => item.id === suit).map(item => [item.name, item.kind, item.count]);
  assert.deepEqual(held, [['蓝武士装', 'collectible', 1]]);
  assert.ok(!liaosi.snapshot().shopItems.some(item => item.id === suit), 'the shop does not list it');
  const unsold = liaosi.exportSave();
  assert.equal(liaosi.dispatch({ type: 'buyItem', itemId: suit, quantity: 1 }).ok, false);
  assert.equal(liaosi.exportSave(), unsold, 'nor sell it');
}

/**
 * A version-2 save keeps what version 3 retired or newly pays: 黑刺球's collection essence, whose recruitment retired when
 * 卡特斯's essence began to hatch 黑刺球, becomes 卡特斯's essence, and an earlier 里奥斯 clear receives the 蓝武士装 once.
 */
function checkVersion2Save({ createGame, catalog, base }) {
  const version2 = { ...structuredClone(base), version: 2 }, katesi = 'essence_boss_dark_trial_katesi';
  version2.items.essence_collection_167 = 1;
  version2.game.shopUnlocked = ['essence_collection_167'];
  version2.progress.bosses_cleared = ['boss_spt_liaosi'];
  const upgraded = createGame(catalog, JSON.stringify(version2)), held = id => upgraded.snapshot().items.find(item => item.id === id);
  assert.deepEqual([held(katesi)?.name, held(katesi)?.count, held('essence_collection_167')], ['黑刺球精元', 1, undefined], 'the essence moves');
  assert.equal(held('suit_blue_warrior')?.count, 1, 'an earlier 里奥斯 clear receives the suit');
  const owned = upgraded.snapshot().monsters.length;
  upgraded.dispatch({ type: 'useItem', itemId: katesi, uid: upgraded.snapshot().party[0] });
  assert.deepEqual(upgraded.snapshot().monsters.slice(owned).map(mon => [mon.species, mon.level]), [[167, 1]], 'it hatches 黑刺球');
  assert.ok(upgraded.snapshot().shopItems.some(item => item.id === katesi), 'its shop listing moves with it');
}

memoryStorage();
await withSsr('boss-essence-targets', async load => {
  const fixture = await loadFixture(load);
  const declaredInfantRewards = checkDeclaredInfantRewards(fixture);
  checkCatalogOutputsAgree(fixture);
  checkEssencesHatchInitialForms(fixture);
  checkExplicitAndFallbackBindings(fixture);
  checkCampaignRewards(fixture);
  const battle = battleFixture(fixture);
  checkVictorySettlement(fixture, battle);
  checkFirstClearCollectible(fixture, battle);
  checkVersion2Save(fixture);
  assert.equal(JSON.stringify(fixture.catalog), fixture.originalCatalog, 'Controllers and fixture preserve the caller catalog.');
  console.log(JSON.stringify({ declaredInfantRewards, checks: CHECK_NAMES }));
});
