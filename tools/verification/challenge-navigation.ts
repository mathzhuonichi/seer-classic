import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createGame } from '../../src/kernel/game.ts';
import { loadCatalog } from '../../src/domain/catalog/catalog.ts';
import { WORLD_GALAXIES, WORLD_PLANETS, findChallengeLocation, findSceneChallenges, resolveWorldLocation } from '../../src/domain/world/world.ts';
import { campaignBackdrop } from '../../src/features/battle/index.ts';
import { braveTowerFloor } from '../../src/domain/challenges/brave-tower.ts';
import { challengeDetail, challengeEntries, challengeHonors } from '../../src/features/challenges/challenge-center.ts';
import ChallengeCenter from '../../src/features/challenges/ui/ChallengeCenter.tsx';
import { suite } from './_harness.mjs';

// Exercise the live encounter view catalog (bosses and trainers) without reading or changing a browser save.
const t = suite('challenge-navigation');
const catalog = await loadCatalog() as any, encounters = [...catalog.bosses, ...catalog.trainers];
const game = createGame(catalog);
const bosses = game.snapshot().bosses;
t.check('all catalog location texts retained', () => {
  assert.equal(bosses.length, encounters.length);
  assert(bosses.every(boss => boss.location === encounters.find((source: any) => source.id === boss.id).location.zh));
});
const expected: Record<string, [string, string]> = {
  boss_spt_moguguai: ['klose', 'forest'],
  boss_spt_gangyasha: ['ocean', 'seabed'],
  boss_spt_tiyasi: ['cloud', 'summit'],
  boss_rei: ['helka', 'temple'],
  boss_spt_akexiya: ['cecilia', 'peak'],
  boss_spt_hamoleite: ['hamo', 'dragon-temple'],
  boss_spt_eersaila: ['tuck', 'light-city'],
  boss_spt_moduosa: ['modusa', 'stone-city'],
  boss_spt_kenpeide: ['rabol', 'surface'],
  boss_spt_naduolei: ['alpha', 'surface'],
  boss_spt_sibinsai: ['alpha', 'energy'],
  boss_spt_ruiersi: ['twitter', 'galia'],
  boss_spt_luolasike: ['pegasus', 'crystal-cave'],
  boss_spt_basuoer: ['small-phantom', 'remains'],
  boss_spt_nate: ['devil', 'abyss'],
  boss_buleike: ['grace', 'altar'],
  boss_paluodiya: ['bast', 'dragon-realm'],
};
t.check('17 representative explicit locations', () => {
  for (const [id, [planetId, regionId]] of Object.entries(expected)) {
    const boss = bosses.find(boss => boss.id === id)!;
    assert(boss, `Missing mapped encounter ${id}.`);
    assert.deepEqual(findChallengeLocation(boss), { planetId, regionId, staging: false });
  }
});
let mapped = 0, explicit = 0, metadata = 0, staged = 0;
t.check('all encounters have valid landings and local targets; no unrelated or duplicate target actors', () => {
  for (const boss of bosses) {
    const destination = findChallengeLocation(boss);
    const { planet, region } = resolveWorldLocation(destination.planetId, destination.regionId);
    assert.equal(planet.id, destination.planetId);
    assert.equal(region.id, destination.regionId);
    if (destination.staging) {
      staged++;
      assert.equal(planet.id, 'station');
      assert(region.challengeStaging);
    } else {
      mapped++;
      if (region.bossIds?.includes(boss.id)) explicit++;
      else { metadata++; assert(['tower','dark'].includes(boss.category)||[planet.name,...(planet.aliases??[])].some(name=>boss.location?.includes(name)), 'A catalog planet route must be supported by its facility category, retained location text or a source-backed alias.'); }
    }
    const sceneBosses = findSceneChallenges(planet.id, region.id, bosses, boss.id);
    if(region.campaignId||planet.id==='space-station'&&region.id==='brave-tower')assert.equal(sceneBosses.length,0,`${boss.id} uses its progression entry.`);
    else assert(sceneBosses.some(local => local.id === boss.id), `${boss.id} must remain interactable after arrival.`);
    assert.equal(new Set(sceneBosses.map(local => local.id)).size, sceneBosses.length);
    const elsewhere = findSceneChallenges('station', 'lab', bosses, boss.id);
    assert(!elsewhere.some(local => local.id === boss.id), 'A travel target must not appear in an unrelated scene.');
  }
});
t.check('five Helka training stages land at the lake, whose one contact opens 雷伊技能特训', () => {
  assert.equal(resolveWorldLocation('helka', 'training-lake').region.campaignId, 'rei-training');
  for (let index = 1; index <= 5; index++) {
    const boss = bosses.find(boss => boss.id === `boss_rei_training${index}`)!;
    assert.equal(boss.location, '赫尔卡星 雷伊特训（湖边）');
    assert.deepEqual(findChallengeLocation(boss), { planetId: 'helka', regionId: 'training-lake', staging: false });
    assert.equal(findSceneChallenges('helka', 'training-lake', bosses, boss.id).length, 0, 'A stage opens from the campaign contact, not as its own actor.');
  }
});
t.check('seven 麒麟 stages land at 麒麟空间 (map 73), whose one contact opens 麒麟六道轮回 in front of that scene', () => {
  const { planet, region } = resolveWorldLocation('qilin', 'space');
  assert.deepEqual([planet.id, region.id, region.campaignId, region.originalMapId], ['qilin', 'space', 'qilin', 73]);
  const stages = game.snapshot().campaigns.find(campaign => campaign.id === 'qilin')!.stages.flatMap(stage => stage.bossIds);
  assert.equal(stages.length, 7);
  for (const id of stages) {
    const boss = bosses.find(boss => boss.id === id)!;
    assert.equal(boss.location, '麒麟空间');
    assert.deepEqual(findChallengeLocation(boss), { planetId: 'qilin', regionId: 'space', staging: false }, id);
    assert.equal(findSceneChallenges('qilin', 'space', bosses, id).length, 0, 'A stage opens from the campaign contact, not as its own actor.');
  }
  assert(region.background && ['official', 'remastered'].includes(region.backgroundKind!), 'The scene shows recovered map art.');
  assert.deepEqual(campaignBackdrop(game.snapshot(), 'qilin'), { src: region.background, name: '麒麟空间' });
});
const spt = bosses.filter(boss => boss.category === 'spt');
t.check('all SPT encounters use mapped habitats', () => {
  assert.equal(spt.length, catalog.bosses.filter((boss: any) => boss.category === 'spt').length);
  for (const boss of spt) {
    const landing=findChallengeLocation(boss);
    assert.equal(landing.staging,false,`${boss.name} must have its own mapped habitat.`);
    assert.notEqual(landing.planetId,'station',`${boss.name} must not use the generic ship dock.`);
    const {region}=resolveWorldLocation(landing.planetId,landing.regionId);
    assert(region.bossIds?.includes(boss.id),`${boss.name} must be present on ordinary map arrival.`);
  }
});
t.check('55 primary-index destinations in five galaxies plus small Phantom and bases', () => {
  assert.deepEqual(WORLD_GALAXIES.map(galaxy=>galaxy.originalId),[1,2,3,4,5]);
  assert.equal(WORLD_PLANETS.filter(planet=>planet.galaxyId!=='ship'&&planet.id!=='small-phantom').length,55);
  assert.equal(new Set(WORLD_PLANETS.map(planet=>planet.id)).size,WORLD_PLANETS.length);
  for (const planet of WORLD_PLANETS) {
    assert(planet.galaxyId==='ship'||WORLD_GALAXIES.some(galaxy=>galaxy.id===planet.galaxyId));
    assert.equal(new Set(planet.regions.map(region=>region.id)).size,planet.regions.length);
    assert(fs.existsSync(`public${planet.background.split('?')[0]}`),`Missing scenery for ${planet.name}.`);
  }
  assert.equal(WORLD_PLANETS.find(planet=>planet.id==='rabol')!.galaxyId,'rogue');
  assert.equal(WORLD_PLANETS.find(planet=>planet.id==='rabol')!.originalMapId,441);
  assert.equal(WORLD_PLANETS.find(planet=>planet.id==='twitter')!.name,'推特星');
  assert.equal(WORLD_PLANETS.find(planet=>planet.id==='giant')!.name,'巨石星');
});
t.check('actual space-station tower and dark-arena routes', () => {
  assert.deepEqual(findChallengeLocation({ ...bosses.find(boss => boss.id === 'boss_rei')!, location: '海洋星海底' }), { planetId: 'helka', regionId: 'temple', staging: false }, 'Explicit IDs remain authoritative when metadata differs.');
  for (const [category, planetId, regionId] of [['tower', 'space-station', 'brave-tower'], ['dark', 'space-station', 'dark-arena'], ['quest', 'station', 'transport']] as const) {
    const boss = bosses.find(boss => boss.category === category)!;
    assert(boss, `Missing category ${category}.`);
    assert.deepEqual(findChallengeLocation(boss), { planetId, regionId, staging: planetId==='station' });
  }
  const unmappedLegend = bosses.find(boss => boss.category === 'legendary' && !Object.hasOwn(expected, boss.id) && findChallengeLocation(boss).staging)!;
  assert.deepEqual(findChallengeLocation(unmappedLegend), { planetId: 'station', regionId: 'transport', staging: true });
  const hamo = findSceneChallenges('hamo', 'dragon-temple', bosses, 'boss_spt_hamoleite');
  assert.equal(hamo.length, resolveWorldLocation('hamo', 'dragon-temple').region.bossIds!.length, 'The selected mapped boss must not duplicate its existing scene actor.');
  assert.equal(findSceneChallenges('station', 'challenge-dock', bosses, 'missing-id').length, 0);
});
t.check('every Boss opens from the start: clearing its source prerequisites changes neither its start nor its archive status', () => {
  const fresh = JSON.parse(game.exportSave()), campaignBosses = new Set(game.snapshot().campaigns.flatMap(row => row.stages.flatMap(stage => stage.bossIds)));
  // Only a campaign's stage order and the Tower's floor order gate a fight; the other source chains are history.
  const chained = encounters.filter((record: any) => record.unlock?.requires?.length && !campaignBosses.has(record.id) && braveTowerFloor(record.id) === undefined);
  const attempt = (id: string, cleared: string[]) => {
    const journey = createGame(catalog, JSON.stringify({ ...fresh, progress: { ...fresh.progress, bosses_cleared: cleared } }));
    const result = journey.dispatch({ type: 'startBattle', bossId: id }), s = journey.snapshot();
    return { ...result, battle: s.battle?.name ?? null, status: challengeDetail(challengeEntries(s).find(entry => entry.id === id)!, s, false).status };
  };
  let started = 0;
  for (const record of chained) {
    const open = attempt(record.id, []);
    assert.deepEqual(attempt(record.id, [...record.unlock.requires]), open, record.id);
    assert.equal(open.status, '可挑战', record.id);
    if (open.ok) started++;
  }
  assert.equal(chained.length, 24, 'the 21 dark-arena doors, the second 克莱芬 and 克拉尼特 fights and the Mystery Realm 谱尼');
  assert(started > 0, 'A fresh party starts some of them');
});
t.check('travel resolution starts no battle', () => {
  assert.equal(game.snapshot().battle, null, 'Finding travel destinations does not begin combat.');
  assert.deepEqual(WORLD_PLANETS[0].regions.map(region=>region.id),['transport','lab','captain']);
  assert.equal(WORLD_PLANETS[0].regions.filter(region => region.challengeStaging).length,1);
});
t.check('Boss titles and achievements follow the cleared record into the archive, without a save field', () => {
  const save = JSON.parse(game.exportSave());
  save.progress.bosses_cleared = ['boss_spt_guerzhadi', 'boss_gaia', 'boss_spt_eersaila', 'boss_tower_brave_f050', 'boss_tower_brave_f060'];
  const cleared = createGame(catalog, JSON.stringify(save)), archive = cleared.snapshot(), entries = challengeEntries(archive);
  const row = (id: string) => archive.bosses.find(boss => boss.id === id)!;
  const detail = (id: string) => challengeDetail(entries.find(entry => entry.id === id)!, archive, false);
  assert.deepEqual(row('boss_spt_guerzhadi').honors, ['击败古尔扎迪', '称号：毁灭者']);
  assert.deepEqual(row('boss_spt_eersaila').honors, ['称号：七色光羽'], 'Only the base fight is offered, so its clear earns the all-variant title');
  assert.equal(detail('boss_spt_guerzhadi').honors, '已获得：击败古尔扎迪 · 称号：毁灭者', 'A cleared row shows what it earned');
  assert.equal(detail('boss_spt_ruiersi').honors, '通关后获得：击败瑞尔斯 · 称号：高傲的狂战者', 'An open row shows what it offers');
  assert.equal(detail('boss_spt_saiweier').honors, undefined);
  assert.equal(detail('brave-tower').honors, `已获得：${archive.braveTower.honors.join(' · ')}`);
  const honors = challengeHonors(archive), tower = honors.filter(honor => honor.source === '勇者之塔');
  assert.deepEqual(honors.filter(honor => !tower.includes(honor)), [
    { label: '击败盖亚', source: row('boss_gaia').name }, { label: '称号：七色光羽', source: row('boss_spt_eersaila').name },
    { label: '击败古尔扎迪', source: row('boss_spt_guerzhadi').name }, { label: '称号：毁灭者', source: row('boss_spt_guerzhadi').name },
  ]);
  assert(tower.length > 0);assert.deepEqual(tower.map(honor => honor.label), archive.braveTower.honors, 'The tower honours match the tower view');
  assert(!cleared.exportSave().includes('毁灭者'), 'Honours are derived, not saved');
});
t.check('The archive panel shows a cleared Boss row its 挑战荣誉 and counts the 荣誉档案', () => {
  const save = JSON.parse(game.exportSave());
  save.progress.bosses_cleared = ['boss_spt_guerzhadi'];
  const cleared = createGame(catalog, JSON.stringify(save)), full = cleared.snapshot();
  // Two SPT Bosses with honours: the tab opens on the lower dex number, the cleared 古尔扎迪, so the render needs no click.
  const shown = { ...full, bosses: full.bosses.filter(boss => ['boss_spt_guerzhadi', 'boss_spt_ruiersi'].includes(boss.id)) };
  const store = Object.assign(Object.create(cleared), { snapshot: () => shown });
  const html = renderToStaticMarkup(React.createElement(ChallengeCenter, { c: store }));
  assert(html.includes(`<h3>${shown.bosses.find(boss => boss.id === 'boss_spt_guerzhadi')!.name}</h3>`), 'The cleared Boss row is open');
  assert(html.includes('<strong>挑战荣誉</strong><p>已获得：击败古尔扎迪 · 称号：毁灭者</p>'), 'Its detail shows what the clear earned');
  assert(html.includes('荣誉档案 · 2'), 'The honour roll button counts the earned honours');
});
t.finish({ encounters: bosses.length, spt: spt.length, destinations: WORLD_PLANETS.length, mapped, explicit, metadata, staged });
