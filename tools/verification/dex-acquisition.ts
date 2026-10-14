import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createGame } from '../../src/game';
import { WORLD_PLANETS } from '../../src/world';
import { CHALLENGE_CAMPAIGNS } from '../../src/progression/challenge-campaigns';
import { buildAcquisitionFamilies, buildAcquisitionIndex, NPC_ONLY_SPECIES, resolveEncounterEssenceSpecies, type AcquisitionCatalog } from '../../src/progression/acquisition';
import { autoEvolve, createMonster, evolutionOptions, gainLevels, makeDex, SeededRng } from '../../raising/core/index';

/** Audit catalog-wide route coverage without granting generic remote recruitment. */
export function runDexAcquisitionAudit(outputDirectory = 'artifacts/dex-acquisition-v14') {
  const source = JSON.parse(readFileSync('data/gamedata.json', 'utf8'));
  source.bosses = readdirSync('data/bosses').filter(file => file.endsWith('.json')).sort().map(file => JSON.parse(readFileSync(`data/bosses/${file}`, 'utf8')));
  const original = structuredClone(source);
  for (const id of [111, 112, 671]) assert.deepEqual(source.species.find((species: any) => species.id === id), JSON.parse(readFileSync(`data/monsters/${String(id).padStart(4, '0')}.json`, 'utf8')), 'The executable bundle and source species record must agree.');
  const index = buildAcquisitionIndex(original as AcquisitionCatalog);
  const families = buildAcquisitionFamilies(original as AcquisitionCatalog, index);
  assert.equal(new Set(families.flatMap(family => family.memberIds)).size, source.species.length, 'Every retained species belongs to one source-defined family.');
  assert.equal(families.flatMap(family => family.memberIds).length, source.species.length);
  assert.deepEqual(families.filter(family => family.status === 'npc').map(family => family.memberIds), [[122, 123, 124], [125]], 'The user-specified exclusions apply to both complete example families.');
  const runtime = structuredClone(source);
  const fresh = createGame(runtime);
  const byId = new Map<number, any>(source.species.map((species: any) => [species.id, species]));
  const available = [...index].filter(([, entry]) => entry.status === 'available').map(([id]) => id);
  const direct = [...index].filter(([, entry]) => entry.routes.some(route => route.kind !== 'evolution')).map(([id]) => id);
  const missing = [...index].filter(([, entry]) => entry.status === 'unimplemented').map(([id]) => id);
  assert.equal(index.size, 1483);
  assert.equal(available.length + missing.length + NPC_ONLY_SPECIES.size, index.size);
  assert.deepEqual(fresh.snapshot().monsters.map(mon => mon.species), [1, 4, 7]);
  for (const quest of fresh.snapshot().quests) assert(index.get(quest.rewardSpecies)?.routes.some(route => route.questId === quest.id));

  const habitatCaptures: { species: number; planetId: string; regionId: string }[] = [];
  const habitatInterceptions: { species: number; planetId: string; regionId: string; battle: string | null }[] = [];
  const simplifiedHabitatChains: number[][] = [];
  for (const planet of WORLD_PLANETS) for (const region of planet.regions) for (const species of region.creatures) {
    const game = createGame(structuredClone(source));
    game.dispatch({ type: 'startTraining', species, level: region.levels[0] });
    if (!game.snapshot().battle?.canCapture || game.snapshot().battle?.enemy.species !== species) {
      habitatInterceptions.push({ species, planetId: planet.id, regionId: region.id, battle: game.snapshot().battle?.name ?? null });
      continue;
    }
    game.dispatch({ type: 'capture', itemId: 'item_capsule_master' });
    assert(game.snapshot().battle?.captured, `Mapped capture must be executable: ${species}`);
    assert(game.snapshot().monsters.some(mon => mon.species === species));
    habitatCaptures.push({ species, planetId: planet.id, regionId: region.id });
    if ([105, 116, 128, 153].includes(species)) {
      game.dispatch({ type: 'closeBattle' });
      const infant = game.snapshot().monsters.find(mon => mon.species === species)!;
      const prepared = JSON.parse(game.exportSave());
      const position = prepared.storage.findIndex((mon: any) => mon.uid === infant.uid);
      prepared.storage[position] = gainLevels(prepared.storage[position], 100 - infant.level, makeDex(source)).mon;
      const evolver = createGame(structuredClone(source), JSON.stringify(prepared));
      const chain = [species];
      let current = species;
      for (let step = 0; step < source.species.length; step++) {
        const evolution = byId.get(current).evolution.find((edge: any) => edge.method === 'level' && edge.level <= 100);
        if (!evolution) break;
        evolver.dispatch({ type: 'evolve', uid: infant.uid });
        assert.equal(evolver.snapshot().monsters.find(mon => mon.uid === infant.uid)!.species, evolution.to);
        assert(evolver.snapshot().species.find(mon => mon.id === evolution.to)!.owned);
        current = evolution.to; chain.push(current);
      }
      const restored = createGame(structuredClone(source), evolver.exportSave());
      for (const form of chain) assert(restored.snapshot().species.find(mon => mon.id === form)!.owned);
      simplifiedHabitatChains.push(chain);
    }
  }
  // The controller owns its catalog copy, so check each reward essence by hatching it.
  const explicitHatchBindings: Record<string, unknown>[] = [];
  const hatchProbe = createGame(structuredClone(source)), probeSave = hatchProbe.exportSave();
  const hatchItem = (itemId: string) => {
    const save = JSON.parse(probeSave); save.items[itemId] = 1;
    const game = createGame(structuredClone(source), JSON.stringify(save)), before = game.snapshot().monsters.length;
    game.dispatch({ type: 'useItem', itemId, uid: game.snapshot().party[0] });
    return game.snapshot().monsters.slice(before).map(mon => mon.species)[0];
  };
  for (const boss of original.bosses) {
    const campaign = CHALLENGE_CAMPAIGNS.find(candidate => candidate.stages.some(stage => stage.bossIds.includes(boss.id)));
    const intermediate = !!campaign && !campaign.stages.at(-1)!.bossIds.includes(boss.id);
    const explicit = Object.keys(boss.reward?.items ?? {}).filter(id => id.startsWith('essence_'));
    const itemIds = explicit.length ? explicit : !intermediate && !boss.reward?.learn_skill && boss.id !== 'boss_tower_brave_mystery' ? [`essence_${boss.id}`] : [];
    for (const itemId of itemIds) {
      const hatched = hatchItem(itemId);
      assert(byId.has(hatched), `Missing usable essence binding: ${boss.id}/${itemId}`);
      if (boss.reward_hatches !== undefined) {
        assert.equal(hatched, boss.reward_hatches, `Original hatch binding must survive: ${boss.id}`);
        explicitHatchBindings.push({ bossId: boss.id, itemId, actualSpecies: hatched, originalSpecies: boss.reward_hatches, enemySpecies: boss.team.at(-1).species });
      }
    }
  }
  const dex = makeDex(source);
  const evolutionEdges: { from: number; to: number; level: number }[] = [];
  for (const id of available) for (const evolution of byId.get(id).evolution) {
    if (evolution.method !== 'level' || evolution.level === undefined || evolution.level > 100) continue;
    const mon = createMonster(dex, id, 100, new SeededRng(id));
    assert(evolutionOptions(mon, dex).includes(evolution.to), `Level evolution must be executable: ${id}->${evolution.to}`);
    assert.equal(index.get(evolution.to)?.status, 'available');
    evolutionEdges.push({ from: id, to: evolution.to, level: evolution.level });
  }
  // A minimal opponent fixture verifies the real victory -> inventory -> hatch
  // transaction and save reload; it does not establish original boss difficulty.
  const fixture = structuredClone(source);
  fixture.skills.find((skill: any) => skill.id === 10001).accuracy = null;
  const fixtureBoss = fixture.bosses.find((boss: any) => boss.id === 'boss_spt_liaosi');
  fixtureBoss.team[0].hp_override = 1; fixtureBoss.team[0].skills = [20006];
  fixtureBoss.phases = []; fixtureBoss.rules = [];
  const game = createGame(fixture);
  game.dispatch({ type: 'startBattle', bossId: fixtureBoss.id });
  game.dispatch({ type: 'move', skillId: game.snapshot().battle!.player.skills.find(skill => skill.category !== '属性')!.id });
  assert(game.snapshot().battle?.won);
  assert(game.snapshot().items.some(item => item.id === 'essence_liaosi'));
  game.dispatch({ type: 'closeBattle' });
  game.dispatch({ type: 'useItem', itemId: 'essence_liaosi', uid: game.snapshot().party[0] });
  assert(game.snapshot().monsters.some(mon => mon.species === 41), 'Liaosi essence must hatch Huliya, not adult Liaosi.');
  const reloaded = createGame(structuredClone(source), game.exportSave());
  assert(reloaded.snapshot().monsters.some(mon => mon.species === 41));
  const manualEvolutionChecks: number[][] = [];
  for (const [bossId, chain] of [['boss_spt_leinaduo', [111, 112, 113]], ['boss_spt_yalunsi', [671, 672]]] as const) {
    const routeFixture = structuredClone(source);
    routeFixture.skills.find((skill: any) => skill.id === 10001).accuracy = null;
    const opponent = routeFixture.bosses.find((boss: any) => boss.id === bossId);
    opponent.team[0].hp_override = 1; opponent.team[0].skills = [20006];
    opponent.phases = []; opponent.rules = [];
    const collector = createGame(routeFixture);
    collector.dispatch({ type: 'startBattle', bossId });
    collector.dispatch({ type: 'move', skillId: collector.snapshot().battle!.player.skills.find(skill => skill.category !== '属性')!.id });
    assert(collector.snapshot().battle?.won);
    collector.dispatch({ type: 'closeBattle' });
    const essenceId = Object.keys(opponent.reward.items).find(id => id.startsWith('essence_'))!;
    collector.dispatch({ type: 'useItem', itemId: essenceId, uid: collector.snapshot().party[0] });
    const infant = collector.snapshot().monsters.find(mon => mon.species === chain[0])!;
    assert(infant, `Actual boss reward must produce seed form ${chain[0]}`);
    const prepared = JSON.parse(collector.exportSave());
    const position = prepared.storage.findIndex((mon: any) => mon.uid === infant.uid);
    // Raising a fixture to level 100 isolates evolution wiring from grind time.
    prepared.storage[position] = gainLevels(prepared.storage[position], 99, dex).mon;
    assert.equal(autoEvolve(prepared.storage[position], dex).mon.species, chain[0], 'Chamber evolution must remain manual.');
    const evolver = createGame(structuredClone(source), JSON.stringify(prepared));
    for (const species of chain.slice(1)) {
      evolver.dispatch({ type: 'evolve', uid: infant.uid });
      assert.equal(evolver.snapshot().monsters.find(mon => mon.uid === infant.uid)!.species, species);
      assert(evolver.snapshot().species.find(mon => mon.id === species)!.owned, 'An evolved species must register in the encyclopedia.');
    }
    const restored = createGame(structuredClone(source), evolver.exportSave());
    for (const species of chain) assert(restored.snapshot().species.find(mon => mon.id === species)!.owned);
    manualEvolutionChecks.push([...chain]);
  }
  for (const npc of NPC_ONLY_SPECIES) {
    const npcGame = createGame(structuredClone(source));
    npcGame.dispatch({ type: 'startTraining', species: npc });
    assert.equal(npcGame.snapshot().battle, null, 'NPC partners must not gain a normal recruit route.');
    npcGame.dispatch({ type: 'cheatAcquire', species: npc });
    assert(npcGame.snapshot().monsters.some(mon => mon.species === npc), 'Explicit modifier acquisition remains available.');
  }
  const oldWorld = structuredClone(WORLD_PLANETS);
  for (const planet of oldWorld) for (const region of planet.regions) region.creatures = region.creatures.filter(id => ![83, 105, 116, 128, 153].includes(id));
  const oldCatalog = structuredClone(original);
  for (const boss of oldCatalog.bosses) delete boss.reward_hatches;
  for (const species of oldCatalog.species) if ([111, 112, 671].includes(species.id)) species.evolution = [];
  const baseline = buildAcquisitionIndex(oldCatalog, oldWorld);
  const newlyAvailable = available.filter(id => baseline.get(id)?.status !== 'available');
  const noLongerAvailable = [...baseline].filter(([id, entry]) => entry.status === 'available' && index.get(id)?.status !== 'available').map(([id]) => id);
  const explicitRewardSpecies = new Set(original.bosses.flatMap((boss: any) => Object.keys(boss.reward?.items ?? {}).some(id => id.startsWith('essence_')) ? [resolveEncounterEssenceSpecies(boss)] : []));
  const missingSet = new Set(missing);
  const hasPredecessor = (id: number) => byId.get(id).evolves_from !== null || source.species.some((species: any) => species.evolution.some((evolution: any) => evolution.to === id));
  const hasAvailablePredecessor = (id: number) => available.includes(byId.get(id).evolves_from) || source.species.some((species: any) => available.includes(species.id) && species.evolution.some((evolution: any) => evolution.to === id));
  const groups = {
    missingBossInfantRewards: missing.filter(id => explicitRewardSpecies.has(id)),
    unimplementedEvolutionOfAvailablePredecessor: missing.filter(id => !explicitRewardSpecies.has(id) && hasAvailablePredecessor(id)),
    wildMetadataWithoutHabitat: missing.filter(id => !explicitRewardSpecies.has(id) && !hasAvailablePredecessor(id) && byId.get(id).obtain?.includes('wild')),
    missingBaseAcquisition: missing.filter(id => !explicitRewardSpecies.has(id) && !hasAvailablePredecessor(id) && !byId.get(id).obtain?.includes('wild') && !hasPredecessor(id)),
    evolutionsWithUnavailablePredecessors: missing.filter(id => !explicitRewardSpecies.has(id) && !hasAvailablePredecessor(id) && !byId.get(id).obtain?.includes('wild') && hasPredecessor(id)),
  };
  assert.equal(Object.values(groups).flat().length, missing.length);
  assert.equal(new Set(Object.values(groups).flat()).size, missing.length);
  const routes = [...index].map(([id, entry]) => ({ id, name: byId.get(id).name.zh, obtainMetadata: byId.get(id).obtain, ...entry }));
  const sourceHashes = Object.fromEntries(['src/game.ts', 'src/progression/acquisition.ts', 'src/world.ts', 'src/world-expansion.ts', 'src/components/Dex.tsx', 'src/components/WorldMap.tsx', 'src/App.tsx', 'raising/core/monster.ts', 'raising/core/types.ts', 'data/gamedata.json'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
  sourceHashes['data/bosses/*.json (sorted parsed records)'] = createHash('sha256').update(JSON.stringify(original.bosses)).digest('hex');
  const summary = {
    catalogSpecies: index.size, excludedNpcSpecies: [...NPC_ONLY_SPECIES], collectibleDenominator: index.size - NPC_ONLY_SPECIES.size,
    availableSpecies: available.length, directAcquisitionSpecies: direct.length, evolutionOnlySpecies: available.length - direct.length,
    familyCounts: { total: families.length, excluded: families.filter(family => family.status === 'npc').length,
      eligible: families.filter(family => family.status !== 'npc').length, complete: families.filter(family => family.status === 'complete').length,
      partial: families.filter(family => family.status === 'partial').length, missing: families.filter(family => family.status === 'missing').length,
      withAnyRoute: families.filter(family => family.availableSpecies.length).length },
    missingSpecies: missing.length, baselineAvailableSpecies: [...baseline.values()].filter(entry => entry.status === 'available').length,
    newlyAvailable: newlyAvailable.map(id => ({ id, name: byId.get(id).name.zh })),
    noLongerAvailable,
    groupCounts: Object.fromEntries(Object.entries(groups).map(([name, ids]) => [name, ids.length])),
    mappedCaptureSpecies: new Set(habitatCaptures.map(entry => entry.species)).size, namedEncounterCount: source.bosses.length,
    originalRewardBindings: explicitHatchBindings.length, restoredInfantBindings: explicitHatchBindings.filter(entry => entry.actualSpecies !== entry.enemySpecies).length,
    evolutionEdgesChecked: evolutionEdges.length,
    availableOnlyViaAuthoredReward: routes.filter(entry => entry.status === 'available' && entry.routes.every(route => route.authoredReward)).length,
    campaignCount: CHALLENGE_CAMPAIGNS.length,
    manualEvolutionChecks,
    simplifiedHabitatChains,
    checks: ['all mapped habitats tested with actual capsule capture', 'first simplified habitat batch captured, evolved, registered, and reloaded through controller', 'all runtime essence items checked against catalog and original hatch metadata', 'reachable level-evolution edges checked by raising API', 'real victory/essence/hatch/reload fixture', 'two source-confirmed manual evolution chains through controller and reload', 'NPC normal recruitment rejected; modifier retained'],
  };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(`${outputDirectory}/audit.json`, JSON.stringify({ summary, sourceHashes, habitatCaptures, habitatInterceptions, explicitHatchBindings, evolutionEdges, routes,
    families: families.map(family => ({ ...family, members: family.memberIds.map(id => ({ id, name: byId.get(id).name.zh, status: index.get(id)!.status })) })),
    missingGroups: Object.fromEntries(Object.entries(groups).map(([group, ids]) => [group, ids.map(id => ({ id, name: byId.get(id).name.zh }))])) }, null, 2) + '\n');
  const lines = ['# Complete missing acquisition list', '', 'Generated by tools/verification/dex-acquisition.ts. Names preserve the recovered Chinese catalog. Every listed species is in the completeness denominator and lacks an implemented normal route.', ''];
  for (const [name, ids] of Object.entries(groups)) {
    lines.push(`## ${name} (${ids.length})`, '', '| ID | Species | Missing immediate predecessor IDs |', '| --- | --- | --- |');
    for (const id of ids) lines.push(`| ${id} | ${byId.get(id).name.zh} | ${source.species.filter((species: any) => missingSet.has(species.id) && species.evolution.some((evolution: any) => evolution.to === id)).map((species: any) => species.id).join(', ') || '—'} |`);
    lines.push('');
  }
  writeFileSync(`${outputDirectory}/missing-species.md`, lines.join('\n') + '\n');
  const familyLines = ['# Complete acquisition family list', '', 'Ancestry groups use retained forward evolution rules and source-defined evolves_from links. A grouping link does not create an executable evolution. Every retained species appears once. Excluded NPC forms remain visible but do not count against family completeness.', ''];
  for (const status of ['complete', 'partial', 'missing', 'npc'] as const) {
    const selected = families.filter(family => family.status === status);
    familyLines.push(`## ${status} (${selected.length} families)`, '', '| Family ID | Family | Obtainable forms | Missing forms | Excluded forms |', '| --- | --- | --- | --- | --- |');
    const names = (ids: number[]) => ids.map(id => `${id} ${byId.get(id).name.zh}`).join('; ') || '—';
    for (const family of selected) familyLines.push(`| ${family.id} | ${family.name} | ${names(family.availableSpecies)} | ${names(family.missingSpecies)} | ${names(family.excludedSpecies)} |`);
    familyLines.push('');
  }
  writeFileSync(`${outputDirectory}/acquisition-families.md`, familyLines.join('\n') + '\n');
  return summary;
}
