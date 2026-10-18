import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../../src/game.ts';
import { WORLD_GALAXIES, WORLD_PLANETS, findChallengeLocation, findSceneChallenges, resolveWorldLocation } from '../../src/world.ts';

// Exercise the live encounter view catalog without reading or changing a browser save.
const catalog = JSON.parse(fs.readFileSync('data/gamedata.json', 'utf8'));
catalog.bosses = fs.readdirSync('data/bosses').filter(name => name.endsWith('.json')).map(name => JSON.parse(fs.readFileSync(`data/bosses/${name}`, 'utf8')));
const game = createGame(catalog);
const bosses = game.snapshot().bosses;
assert.equal(bosses.length, catalog.bosses.length);
assert(bosses.every(boss => boss.location === catalog.bosses.find((source: any) => source.id === boss.id).location.zh));
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
for (const [id, [planetId, regionId]] of Object.entries(expected)) {
  const boss = bosses.find(boss => boss.id === id)!;
  assert(boss, `Missing mapped encounter ${id}.`);
  assert.deepEqual(findChallengeLocation(boss), { planetId, regionId, staging: false });
}
let mapped = 0, explicit = 0, metadata = 0, staged = 0;
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
    else { metadata++; assert(['勇者之塔','暗黑武斗场'].includes(boss.category)||[planet.name,...(planet.aliases??[])].some(name=>boss.location?.includes(name)), 'A catalog planet route must be supported by its facility category, retained location text or a source-backed alias.'); }
  }
  const sceneBosses = findSceneChallenges(planet.id, region.id, bosses, boss.id);
  if(region.campaignId||planet.id==='space-station'&&region.id==='brave-tower')assert.equal(sceneBosses.length,0,`${boss.id} uses its progression entry.`);
  else assert(sceneBosses.some(local => local.id === boss.id), `${boss.id} must remain interactable after arrival.`);
  assert.equal(new Set(sceneBosses.map(local => local.id)).size, sceneBosses.length);
  const elsewhere = findSceneChallenges('station', 'lab', bosses, boss.id);
  assert(!elsewhere.some(local => local.id === boss.id), 'A travel target must not appear in an unrelated scene.');
}
for (let index = 1; index <= 5; index++) {
  const boss = bosses.find(boss => boss.id === `boss_rei_training${index}`)!;
  assert.equal(boss.location, '赫尔卡星 雷伊特训（湖边）');
  assert.deepEqual(findChallengeLocation(boss), { planetId: 'helka', regionId: 'training-lake', staging: false });
  assert.deepEqual(findSceneChallenges('helka', 'training-lake', bosses, boss.id).map(local => local.id), [boss.id]);
}
assert.equal(findSceneChallenges('helka', 'training-lake', bosses).length, 0, 'The five alternate training challenges must not appear simultaneously.');
const spt = bosses.filter(boss => boss.category === 'SPT首领');
assert.equal(spt.length, catalog.bosses.filter((boss: any) => boss.category === 'spt').length);
for (const boss of spt) {
  const landing=findChallengeLocation(boss);
  assert.equal(landing.staging,false,`${boss.name} must have its own mapped habitat.`);
  assert.notEqual(landing.planetId,'station',`${boss.name} must not use the generic ship dock.`);
  const {region}=resolveWorldLocation(landing.planetId,landing.regionId);
  assert(region.bossIds?.includes(boss.id),`${boss.name} must be present on ordinary map arrival.`);
}
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
assert.deepEqual(findChallengeLocation({ ...bosses.find(boss => boss.id === 'boss_rei')!, location: '海洋星海底' }), { planetId: 'helka', regionId: 'temple', staging: false }, 'Explicit IDs remain authoritative when metadata differs.');
for (const [category, planetId, regionId] of [['勇者之塔', 'space-station', 'brave-tower'], ['暗黑武斗场', 'space-station', 'dark-arena'], ['任务挑战', 'station', 'transport']] as const) {
  const boss = bosses.find(boss => boss.category === category)!;
  assert(boss, `Missing category ${category}.`);
  assert.deepEqual(findChallengeLocation(boss), { planetId, regionId, staging: planetId==='station' });
}
const unmappedLegend = bosses.find(boss => boss.category === '传说挑战' && !Object.hasOwn(expected, boss.id) && findChallengeLocation(boss).staging)!;
assert.deepEqual(findChallengeLocation(unmappedLegend), { planetId: 'station', regionId: 'transport', staging: true });
const hamo = findSceneChallenges('hamo', 'dragon-temple', bosses, 'boss_spt_hamoleite');
assert.equal(hamo.length, resolveWorldLocation('hamo', 'dragon-temple').region.bossIds!.length, 'The selected mapped boss must not duplicate its existing scene actor.');
assert.equal(findSceneChallenges('station', 'challenge-dock', bosses, 'missing-id').length, 0);
assert.equal(game.snapshot().battle, null, 'Finding travel destinations does not begin combat.');
assert.deepEqual(WORLD_PLANETS[0].regions.map(region=>region.id),['transport','lab','captain']);
assert.equal(WORLD_PLANETS[0].regions.filter(region => region.challengeStaging).length,1);
console.log(JSON.stringify({ passed: ['all catalog location texts retained', '17 representative explicit locations', `all ${spt.length} SPT encounters use mapped habitats`, '55 primary-index destinations in five galaxies plus small Phantom and bases', 'five Helka training routes', 'actual space-station tower and dark-arena routes', 'all encounters have valid landings and local targets', 'no unrelated or duplicate target actors', 'travel resolution starts no battle'], encounters: bosses.length, spt:spt.length, destinations:WORLD_PLANETS.length, mapped, explicit, metadata, staged }));
