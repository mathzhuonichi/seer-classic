import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Place initial forms that lack any entry on modeled regions whose original map
// lists them, using the same seer_data dump as the species catalog.
// Run from any directory: node tools/assets/build_habitats.mjs
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COMMIT = 'a00bcdd';
const SOURCES = { maps: 'resource/config/xml/maps.json', petbook: 'resource/config/xml/petbook.json' };
const cache = path.join(root, '.cache', `seer-data-${COMMIT}`);
const output = path.join(root, 'data/habitats.json');

async function source(file) {
  const target = path.join(cache, path.basename(file));
  if (!fs.existsSync(target)) {
    const response = await fetch(`https://raw.githubusercontent.com/Nattsu39/seer_data/${COMMIT}/${file}`);
    if (!response.ok) throw new Error(`Download failed: ${file} (${response.status})`);
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = fs.readFileSync(target);
  return { json: JSON.parse(bytes.toString('utf8')), sha256: createHash('sha256').update(bytes).digest('hex') };
}

const list = value => (value == null ? [] : Array.isArray(value) ? value : [value]);
const ids = value => String(value ?? '').split(/\s+/).filter(Boolean).map(Number);

const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { WORLD_PLANETS, GENERATED_HABITATS } = await server.ssrLoadModule('/src/world.ts');
  const { buildAcquisitionIndex, NPC_ONLY_SPECIES } = await server.ssrLoadModule('/src/progression/acquisition.ts');
  const { buildInitialFormAcquisitionIndex } = await server.ssrLoadModule('/src/progression/initial-acquisition.ts');
  const maps = await source(SOURCES.maps), petbook = await source(SOURCES.petbook);
  const read = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
  const catalog = read('data/gamedata.json');
  catalog.bosses = fs.readdirSync(path.join(root, 'data/bosses')).filter(file => file.endsWith('.json')).sort().map(file => read(`data/bosses/${file}`));
  const byId = new Map(catalog.species.map(species => [species.id, species]));

  // Regenerate from the authored world: remove this file's previous placements.
  const generated = new Set(GENERATED_HABITATS.map(entry => `${entry.planetId}/${entry.regionId}/${entry.species}`));
  const planets = structuredClone(WORLD_PLANETS);
  for (const planet of planets) for (const region of planet.regions) {
    region.creatures = region.creatures.filter(id => !generated.has(`${planet.id}/${region.id}/${id}`));
  }
  const regions = planets.flatMap(planet => planet.regions
    .filter(region => planet.id !== 'station' && !region.facility && !region.challengeStaging)
    .map(region => ({ planet, region })));

  const index = buildAcquisitionIndex(catalog, planets);
  const initial = buildInitialFormAcquisitionIndex(catalog, index);
  const placed = new Set(regions.flatMap(({ region }) => region.creatures));
  // The controller redirects these species to their named encounter instead of the field.
  const intercepted = new Set(catalog.bosses.filter(boss => !boss.id.includes('tower') && !boss.id.includes('dark_door'))
    .flatMap(boss => boss.team.map(member => member.species)));
  const candidates = catalog.species.map(species => species.id).filter(id => !NPC_ONLY_SPECIES.has(id)
    && initial.get(id)?.initialForms.some(form => form.species === id)
    && index.get(id).routes.every(route => route.kind === 'evolution')
    && !placed.has(id) && !intercepted.has(id));

  const wild = new Map(), catchable = new Map(), mapNames = new Map();
  for (const map of maps.json.Maps.Map) {
    mapNames.set(map.ID, map.Name);
    for (const monster of list(map.Monsters?.Monster)) for (const id of ids(monster.ID)) {
      const [low, high = low] = ids(monster.Lv);
      const ranges = wild.get(id) ?? new Map(), range = ranges.get(map.ID) ?? [low, high];
      ranges.set(map.ID, [Math.min(range[0], low), Math.max(range[1], high)]);
      wild.set(id, ranges);
    }
    for (const boss of list(map.Bosses?.Boss)) if (Number(boss.BossCatchable) === 1) for (const id of ids(boss.BossMon?.MonID)) {
      if (!catchable.has(id)) catchable.set(id, new Map());
      catchable.get(id).set(map.ID, Number(boss.BossMon.Lv) || 0);
    }
  }
  const foundIn = new Map(list(petbook.json.root.Monster).map(entry => [entry.ID, entry.Foundin]));

  // Without a source level, meet the form shortly before its first level evolution.
  const derivedLevels = species => {
    const level = species.evolution?.find(step => step.method === 'level')?.level;
    return level ? [Math.max(2, level - 8), Math.max(2, level - 5)] : [20, 25];
  };
  const habitatRegions = map => regions.filter(({ region }) => region.originalMapId === map);
  const namedRegion = name => {
    if (!name || name === '--') return null;
    const exact = regions.find(({ region }) => region.name === name);
    if (exact) return exact;
    const planet = planets.find(candidate => [candidate.name, ...(candidate.aliases ?? [])].includes(name));
    const local = planet && regions.filter(entry => entry.planet === planet);
    return local?.find(entry => entry.region.creatures.length) ?? local?.[0] ?? null;
  };

  const habitats = [], unplaced = [];
  for (const id of candidates) {
    const species = byId.get(id), capturable = species.obtain?.includes('wild') && species.catch_rate > 0;
    const entry = ({ planet, region }, levels, evidence, scarce) => ({
      species: id, name: species.name.zh, planetId: planet.id, regionId: region.id, levels, scarce: scarce || !capturable,
      route: capturable ? 'capture' : 'challenge', evidence,
    });
    const wildMaps = [...(wild.get(id) ?? [])].filter(([map]) => habitatRegions(map).length);
    if (wildMaps.length) {
      for (const [map, levels] of wildMaps) for (const location of habitatRegions(map)) {
        habitats.push(entry(location, levels, `maps.json Map ${map} ${mapNames.get(map)} Monsters`, false));
      }
      continue;
    }
    const bossMap = [...(catchable.get(id) ?? [])].find(([map]) => habitatRegions(map).length);
    if (bossMap) {
      const [map, level] = bossMap;
      habitats.push(entry(habitatRegions(map)[0], level ? [level, level] : derivedLevels(species), `maps.json Map ${map} ${mapNames.get(map)} BossCatchable`, true));
      continue;
    }
    const named = namedRegion(foundIn.get(id));
    if (named) habitats.push(entry(named, derivedLevels(species), `petbook.json Foundin ${foundIn.get(id)}`, false));
    else unplaced.push(id);
  }

  const result = {
    note: 'Generated by tools/assets/build_habitats.mjs; do not edit by hand.',
    source: {
      repository: 'https://github.com/Nattsu39/seer_data', commit: COMMIT,
      files: Object.fromEntries([[SOURCES.maps, maps.sha256], [SOURCES.petbook, petbook.sha256]]),
    },
    habitats,
  };
  fs.writeFileSync(output, JSON.stringify(result, null, 1) + '\n');
  const perRegion = {};
  for (const habitat of habitats) perRegion[`${habitat.planetId}/${habitat.regionId}`] = (perRegion[`${habitat.planetId}/${habitat.regionId}`] ?? 0) + 1;
  console.log(JSON.stringify({
    candidates: candidates.length, placedSpecies: new Set(habitats.map(h => h.species)).size, placements: habitats.length,
    capture: habitats.filter(h => h.route === 'capture').length, challenge: habitats.filter(h => h.route === 'challenge').length,
    unplaced: unplaced.length, busiestRegions: Object.entries(perRegion).sort((a, b) => b[1] - a[1]).slice(0, 12),
  }, null, 1));
} finally {
  await server.close();
}
