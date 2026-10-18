/** Run the production registration helpers against representative source clips and a Retina alpha readback. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root, suite, withSsr} from './_harness.mjs';

await withSsr('battle-animation-registration', async load => {
  const {fixedAnimationTransform, standbyMeshBounds, visibleStandbyBounds} = await load('/src/features/battle/battle-animation-registration.ts');
  const t = suite('battle-animation-registration');
  for (const id of [1, 6, 70, 502]) t.check(`Species ${id}: standby extent is centred and scaled to the silhouette extent`, () => {
    const clip = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, `public/battle-animations/${id}.json.gz`))));
    const standby = clip.sequences.find(s => s.name === 'standby');
    const xs = standby.frames.flatMap(f => f.positions.filter((_, i) => i % 2 === 0)), ys = standby.frames.flatMap(f => f.positions.filter((_, i) => i % 2 === 1));
    const bounds = {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)};
    const mesh = standbyMeshBounds({sequences: clip.sequences.map(s => ({...s, frames: s.frames.map(f => ({mesh: {positions: f.positions}}))}))});
    assert.deepEqual(mesh, bounds);
    const transform = fixedAnimationTransform(bounds, 476, 476, .9), midpoint = {x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2};
    assert.ok(Math.abs(midpoint.x * transform.scale.x + transform.position.x - 238) < 1e-8);
    assert.ok(Math.abs(midpoint.y * transform.scale.y + transform.position.y - 238) < 1e-8);
    assert.ok(Math.abs(Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * transform.scale.x - 476 / 1.7 * .9) < 1e-8);
  });
  t.check('A Retina readback of one opaque rectangle yields logical bounds that centre the clip', () => {
    const width = 170, height = 170, pixelWidth = 340, pixelHeight = 340;
    const gl = {RGBA: 1, UNSIGNED_BYTE: 2, readPixels(_x, _y, _w, _h, _rgba, _type, pixels) {
      for (let y = 80; y < 240; y++) for (let x = 120; x < 220; x++) pixels[(y * pixelWidth + x) * 4 + 3] = 255;
    }};
    const canvas = {width: pixelWidth, height: pixelHeight, getContext() { return gl; }};
    const player = {pause() {}, setSequence() {}, gotoFrame() {}, setFixedTransform() {}, draw() {}, getCanvas() { return canvas; }};
    const visible = visibleStandbyBounds(player, {minX: -1, maxX: 1, minY: -1, maxY: 1}, width, height);
    assert.deepEqual(visible, {minX: -.5, maxX: .5, minY: -.9, maxY: .7});
    const transform = fixedAnimationTransform(visible, width, height, .9);
    assert.equal((visible.minX + visible.maxX) / 2 * transform.scale.x + transform.position.x, width / 2);
    assert.ok(Math.abs((visible.minY + visible.maxY) / 2 * transform.scale.y + transform.position.y - height / 2) < 1e-8);
  });
  t.finish();
});
