import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {sceneTrack} from './scene-music.ts';

const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const music = read('../../../data/scene-music.json');
const pins = read('../../../public/audio/source-manifest.json').sceneMusic.files;
const TABLE = {10: 'BGM_004', 13: 'BGM_037', 30: 'BGM_010A'};

test('a scene plays its own map\'s theme, else its planet\'s, else none', () => {
  const klose = {originalMapId: 10};
  assert.equal(sceneTrack(TABLE, klose, {originalMapId: 13}), 'BGM_037', 'the region\'s own map wins');
  assert.equal(sceneTrack(TABLE, klose, {originalMapId: 10}), 'BGM_004');
  assert.equal(sceneTrack(TABLE, {originalMapId: 30}, {}), 'BGM_010A', 'a region without a map plays its planet\'s');
  assert.equal(sceneTrack(TABLE, klose, {originalMapId: 999}), 'BGM_004', 'a map the table lacks plays its planet\'s');
  assert.equal(sceneTrack(TABLE, {}, {}), null);
  assert.equal(sceneTrack(TABLE, {originalMapId: 999}, {originalMapId: 998}), null);
});

test('the period table names the ship, Klose and the Tower themes the 2013 client played', () => {
  for (const [map, track] of [[1, 'BGM_003A'], [4, 'BGM_003A'], [5, 'BGM_003A'], [10, 'BGM_004'], [500, 'BGM_018']]) {
    assert.equal(sceneTrack(music.maps, {}, {originalMapId: map}), track, `map ${map}`);
  }
  for (const map of music.source.later.maps) assert.ok(music.maps[map], `later map ${map} has a theme`);
});

test('every theme of the table is pinned once, and every pin is played somewhere', () => {
  const tracks = new Set(Object.values(music.maps)), pinned = pins.map(pin => pin.track);
  assert.deepEqual([...pinned].sort(), [...tracks].sort());
  for (const pin of pins) {
    assert.match(pin.track, /^BGM_\w+$/);
    assert.equal(pin.file, `scene/${pin.track}.mp3`);
    assert.equal(pin.officialUrl, `https://seer.61.com/resource/map/sound/${pin.track}.mp3`);
    assert.match(pin.sha256, /^[0-9a-f]{64}$/);
    assert.ok(pin.bytes > 0 && pin.durationSeconds > 0, pin.track);
  }
});
