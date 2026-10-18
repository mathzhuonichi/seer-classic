/** Verify source memberships, scene visibility, and actual habitat acquisition. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const memory = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key),
} });
const read = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const definitions = read('data/habitat-regions.json');
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const ids = value => String(value ?? '').split(/\s+/).filter(Boolean).map(Number);
const server = await createServer({ server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { WORLD_PLANETS, GENERATED_HABITATS } = await server.ssrLoadModule('/src/world.ts');
  const { getSceneLayout, creatureSceneHome } = await server.ssrLoadModule('/src/presentation/map-presentation.ts');
  const { buildWorldPopulation } = await server.ssrLoadModule('/src/presentation/world-population.ts');
  const { createGame, loadCatalog } = await server.ssrLoadModule('/src/game.ts');
  const { buildAcquisitionIndex } = await server.ssrLoadModule('/src/progression/acquisition.ts');
  const { buildRecruitmentRewards } = await server.ssrLoadModule('/src/progression/recruitment.ts');
  const maps = read('.cache/seer-data-a00bcdd/maps.json');
  const mapConfig = read('.cache/seer-data-a00bcdd/map_config.json');
  for (const [name, expected] of Object.entries(definitions.source.files)) {
    assert.equal(createHash('sha256').update(fs.readFileSync(`.cache/seer-data-a00bcdd/${name}`)).digest('hex'), expected, `${name}: exact source snapshot`);
  }
  const catalog = await loadCatalog(), original = JSON.stringify(catalog);
  const species = new Map(catalog.species.map(entry => [entry.id, entry]));
  const index = buildAcquisitionIndex(catalog), baseline = JSON.parse(createGame(catalog, '').exportSave());
  baseline.rng_state = [101, 202, 303, 404];
  baseline.items.item_capsule_master = 1;
  const fieldCatalog = structuredClone(catalog);
  Object.assign(fieldCatalog.skills.find(skill => skill.id === 10001), { power: 1000000, accuracy: null, priority: 20 });
  const checked = [], rewards = buildRecruitmentRewards(catalog);
  function acquireRecruitment(habitat, planet, region) {
    const id = habitat.species, reward = rewards.find(entry => entry.rewardSpecies === id);
    assert(reward, `${id}: collection reward exists`);
    assert(region.recruitmentSpecies?.includes(id));
    assert(!index.get(id).routes.some(route => route.kind === 'wild' && route.planetId === planet.id && route.regionId === region.id));
    assert(index.get(id).routes.some(route => route.kind === 'quest' && route.questId === reward.questId));
    const incomplete = createGame(catalog, JSON.stringify(baseline));
    for (const location of [{}, { planetId: planet.id, regionId: region.id }]) {
      const before = incomplete.exportSave();
      incomplete.dispatch({ type: 'startTraining', species: id, level: habitat.levels[0], ...location });
      assert.equal(incomplete.snapshot().battle, null, `${id}: map contact cannot start a direct battle`);
      assert.equal(incomplete.exportSave(), before, `${id}: rejected direct request preserves save, capsule, and RNG`);
    }
    const beforeClaim = incomplete.exportSave();
    incomplete.dispatch({ type: 'claimQuest', questId: reward.questId });
    assert.equal(incomplete.exportSave(), beforeClaim, `${id}: unmet collection quest remains gated`);
    const ready = structuredClone(baseline);
    for (const condition of reward.prerequisites) {
      if (condition.kind === 'species') {
        ready.dex.owned.push(condition.species); ready.dex.seen.push(condition.species);
      } else ready.progress.bosses_cleared.push(condition.bossId);
    }
    const game = createGame(catalog, JSON.stringify(ready));
    const existing = new Set(game.snapshot().monsters.map(mon => mon.uid));
    game.dispatch({ type: 'claimQuest', questId: reward.questId });
    assert.equal(JSON.parse(game.exportSave()).items[reward.itemId], 1, `${id}: completed quest grants its collection essence`);
    game.dispatch({ type: 'useItem', itemId: reward.itemId, uid: game.snapshot().party[0] });
    const restored = createGame(catalog, game.exportSave());
    const acquired = restored.snapshot().monsters.filter(mon => !existing.has(mon.uid));
    assert.equal(acquired.length, 1);
    assert.equal(acquired[0].species, id);
    checked.push({ species: id, planetId: planet.id, regionId: region.id, route: habitat.route });
  }
  function acquire(habitat, planet, region) {
    if (habitat.route === 'recruitment') return acquireRecruitment(habitat, planet, region);
    const entry = { id: habitat.species, levels: habitat.levels };
    const route = index.get(entry.id)?.routes.find(route => route.kind === 'wild' && route.planetId === planet.id && route.regionId === region.id);
    assert(route, `${entry.id}: reachable encyclopedia route`);
    const game = createGame(habitat.route === 'challenge' ? fieldCatalog : catalog, JSON.stringify(baseline));
    game.dispatch({ type: 'cheatMonster', uid: game.snapshot().party[0], level: 100 });
    if (entry.id === 416) {
      game.dispatch({ type: 'startTraining', species: entry.id, level: entry.levels[0], planetId: planet.id, regionId: region.id });
      assert.equal(game.snapshot().battle.canCapture, false, 'Niao requires an active partner');
      const before = game.exportSave();
      game.dispatch({ type: 'capture', itemId: 'item_capsule_master' });
      assert.equal(game.exportSave(), before, 'Missing Niao partner consumes no capsule or RNG');
      game.importSave(JSON.stringify(baseline));
      game.dispatch({ type: 'cheatAcquire', species: 77, level: 5 });
      const partner = game.snapshot().monsters.find(mon => mon.species === 77);
      game.dispatch({ type: 'reorderParty', uids: [partner.uid, ...game.snapshot().party.filter(uid => uid !== partner.uid)] });
      assert.deepEqual([...route.requiredActiveSpecies], [77, 78, 79, 310, 311, 312]);
    }
    const existing = new Set(game.snapshot().monsters.map(mon => mon.uid));
    game.dispatch({ type: 'startTraining', species: entry.id, level: entry.levels[0], planetId: planet.id, regionId: region.id });
    assert.equal(game.snapshot().battle?.enemy.species, entry.id, `${entry.id}: controller starts the selected creature`);
    if (habitat.route === 'capture') {
      assert.equal(game.snapshot().battle.canCapture, true);
      game.dispatch({ type: 'capture', itemId: 'item_capsule_master' });
      assert.equal(game.snapshot().battle.captured, true, `${entry.id}: actual capsule capture`);
    } else {
      assert.equal(game.snapshot().battle.canCapture, false);
      game.dispatch({ type: 'move', skillId: 10001 });
      assert.equal(game.snapshot().battle.won, true, `${entry.id}: field challenge victory`);
    }
    game.dispatch({ type: 'closeBattle' });
    const restored = createGame(catalog, game.exportSave());
    if (habitat.route === 'challenge') restored.dispatch({ type: 'useItem', itemId: `essence_recruit_${entry.id}`, uid: restored.snapshot().party[0] });
    const acquired = restored.snapshot().monsters.filter(mon => !existing.has(mon.uid));
    assert.equal(acquired.length, 1, `${entry.id}: exactly one acquired creature`);
    assert.equal(acquired[0].species, entry.id, `${entry.id}: reload and hatch preserve the selected initial form`);
    checked.push({ species: entry.id, planetId: planet.id, regionId: region.id, route: habitat.route });
  }
  for (const definition of definitions.regions) {
    const planet = WORLD_PLANETS.find(entry => entry.id === definition.planetId);
    const region = planet?.regions.find(entry => entry.id === definition.id);
    const sourceRegion = mapConfig.Maps.map.find(map => Number(map.id) === definition.originalMapId);
    assert(region, definition.id);
    assert.equal(sourceRegion.name, region.name);
    assert.equal(Number(sourceRegion.super), definition.sourceParentMapId);
    assert(planet.originalMapId === definition.sourceParentMapId || planet.regions.some(entry => entry.originalMapId === definition.sourceParentMapId));
    assert.equal(region.originalMapId, definition.originalMapId);
    assert.equal(region.backgroundMapId, definition.backgroundMapId);
    assert(region.sceneAttribution?.includes('reuses recovered parent-map artwork'));
    assert(fs.existsSync(`public${region.background.split('?')[0]}`), `${definition.id}: available scene art`);
    const sourceMaps = maps.Maps.Map.filter(map => map.ID === definition.originalMapId);
    for (const expected of definition.species) assert.deepEqual(region.creatureLevels[expected.id], expected.levels);
    for (const habitat of GENERATED_HABITATS.filter(row => row.regionId === region.id && row.planetId === planet.id)) {
      const entry = { id: habitat.species, levels: habitat.levels, source: habitat.evidence.endsWith(" Monsters") ? "Monsters" : "BossCatchable" };
      assert(region.creatures.includes(entry.id));
      const sourceMatch = entry.source === 'Monsters'
        ? sourceMaps.flatMap(map => list(map.Monsters?.Monster)).some(mon => ids(mon.ID).includes(entry.id) && ids(mon.Lv)[0] === entry.levels[0] && (ids(mon.Lv)[1] ?? ids(mon.Lv)[0]) === entry.levels[1])
        : sourceMaps.flatMap(map => list(map.Bosses?.Boss)).some(boss => Number(boss.BossCatchable) === 1 && ids(boss.BossMon?.MonID).includes(entry.id) && Number(boss.BossMon.Lv) === entry.levels[0]);
      assert(sourceMatch, `${entry.id}: source spawn and levels`);
      acquire(habitat, planet, region);
    }
  }
  const petbook = read('.cache/seer-data-a00bcdd/petbook.json');
  for (const id of definitions.additionalFoundinSpecies) {
    const habitat = GENERATED_HABITATS.find(row => row.species === id);
    assert(habitat, `${id}: supplemental Foundin habitat`);
    const planet = WORLD_PLANETS.find(entry => entry.id === habitat.planetId);
    const region = planet.regions.find(entry => entry.id === habitat.regionId);
    const source = list(petbook.root.Monster).find(entry => entry.ID === id);
    assert([planet.name, ...(planet.aliases ?? []), region.name].includes(source.Foundin));
    assert.equal(habitat.evidence, `petbook.json Foundin ${source.Foundin}`);
    acquire(habitat, planet, region);
  }
  const policies = read('data/acquisition-policy.json');
  const converted = new Set(policies.species.filter(row => row.categories.some(category => ['paid', 'vip', 'lottery'].includes(category))).map(row => row.species));
  const gated = GENERATED_HABITATS.filter(row => row.route === 'recruitment');
  assert.deepEqual(gated.map(row => row.species).sort((a, b) => a - b), [406, 430, 560, 576, 760, 789, 818, 831]);
  for (const habitat of GENERATED_HABITATS.filter(row => converted.has(row.species))) {
    const planet = WORLD_PLANETS.find(entry => entry.id === habitat.planetId);
    const region = planet.regions.find(entry => entry.id === habitat.regionId);
    const sourceMaps = maps.Maps.Map.filter(map => map.ID === region.originalMapId);
    const actualSpawn = sourceMaps.some(map => list(map.Monsters?.Monster).some(mon => ids(mon.ID).includes(habitat.species))
      || list(map.Bosses?.Boss).some(boss => Number(boss.BossCatchable) === 1 && !Number(boss.VipOnly) && ids(boss.BossMon?.MonID).includes(habitat.species)));
    assert.equal(actualSpawn, habitat.route !== 'recruitment', `${habitat.species}: current-map acquisition evidence determines direct access`);
    if (habitat.route === 'recruitment') assert(habitat.evidence.startsWith('petbook.json Foundin '));
    if (checked.some(row => row.species === habitat.species && row.planetId === habitat.planetId && row.regionId === habitat.regionId)) continue;
    acquire(habitat, planet, region);
  }
  const crowded = [];
  for (const planet of WORLD_PLANETS) for (const region of planet.regions) {
    const population = buildWorldPopulation(`${planet.id}/${region.id}`, region.creatures.map(id => ({ id, ...species.get(id) })), 6, region.levels, region.creatureLevels, region.scarceCreatures);
    if (population.length <= 6) continue;
    const layout = getSceneLayout(planet, region);
    const homes = population.map((_, i) => creatureSceneHome(layout, i, population.length));
    assert.equal(new Set(homes.map(p => `${p.x}/${p.y}`)).size, homes.length, `${region.id}: no shared creature anchors`);
    assert(homes.every(p => p.x >= 8 && p.x <= 92 && p.y >= 38 && p.y <= 92));
    crowded.push({ planetId: planet.id, regionId: region.id, count: homes.length });
  }
  assert.equal(JSON.stringify(catalog), original, 'Source catalog unchanged by acquisitions');
  const report = { regions: definitions.regions.length, species: new Set(checked.map(row => row.species)).size, placements: checked.length, captures: checked.filter(row => row.route === 'capture').length, challenges: checked.filter(row => row.route === 'challenge').length, recruitments: checked.filter(row => row.route === 'recruitment').length, crowdedScenes: crowded, checked };
  fs.mkdirSync('artifacts/acquisition-v32', { recursive: true });
  fs.writeFileSync('artifacts/acquisition-v32/habitat-regions.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, checked: undefined }));
} finally {
  await server.close();
  if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
  else delete globalThis.localStorage;
}
