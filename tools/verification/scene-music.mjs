/**
 * World themes in the assembled world (design/notes/bgm-2026-10-24.md): every region plays a theme of data/scene-music.json,
 * every map of the table is a scene of the game, and the regions without a map of their own play their planet's theme. The
 * table's pins and the selection rule are unit-tested in src/domain/world/scene-music.test.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {memoryStorage, root, suite, withSsr} from './_harness.mjs';

const NAME = 'scene-music';
/** The authored regions without a map of their own, and the planet map whose theme they play. */
const MAPLESS = {'helka/training-lake': 'BGM_010A', 'dase/death-river': 'BGM_032'};

memoryStorage();
const music = JSON.parse(fs.readFileSync(path.join(root, 'data/scene-music.json'), 'utf8'));
await withSsr(NAME, async load => {
  const t = suite(NAME);
  const {WORLD_PLANETS, locationTrack} = await load('/src/domain/world/world.ts');
  const scenes = WORLD_PLANETS.flatMap(planet => planet.regions.map(region => ({planet, region, key: `${planet.id}/${region.id}`})));
  t.check('every region of the world plays a theme of the table', () => {
    const silent = scenes.filter(({planet, region}) => !locationTrack({planetId: planet.id, regionId: region.id})).map(scene => scene.key);
    assert.deepEqual(silent, []);
  });
  t.check('every map of the table is a scene of the game', () => {
    const shown = new Set(scenes.map(({planet, region}) => String(region.originalMapId ?? planet.originalMapId)));
    assert.deepEqual(Object.keys(music.maps).filter(map => !shown.has(map)), []);
  });
  t.check('a region without a map of its own plays its planet\'s theme', () => {
    const mapless = scenes.filter(({region}) => region.originalMapId === undefined).map(scene => scene.key);
    assert.deepEqual(mapless.sort(), Object.keys(MAPLESS).sort());
    for (const [key, track] of Object.entries(MAPLESS)) {
      const [planetId, regionId] = key.split('/');
      assert.equal(locationTrack({planetId, regionId}), track, key);
    }
  });
  t.witness('regions', scenes.length);
  t.witness('themes', new Set(scenes.map(({planet, region}) => locationTrack({planetId: planet.id, regionId: region.id}))).size);
  t.finish();
});
