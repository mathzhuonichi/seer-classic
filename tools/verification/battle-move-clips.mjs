/**
 * Every species' move clips (attack, sa, cp, hited) play without jumps in the measured arenas. Between two frames the
 * creature's offset changes no more than its own parts move, plus a step too small to see; a move starts and ends at rest;
 * 鲁斯王's special attack, whose flickering beam made the creature bob (the 2026-10-21 report), is not moved at all; and
 * 闪光波克尔's climb still stays inside the arena; and every attack, sa and cp has a hit marker. Status `needs-assets`: it reads
 * the ignored clips in public/battle-animations/.
 *
 * Rooms: the arena box around a creature's canvas host, in the host's layout pixels (x forward), measured in Chrome on
 * 2026-10-21 at 1000x650 and at 1280x800 (1920x1080 scales the same layout). Sizes: the standby mesh extent filling 0.4 to 2
 * creature boxes, plus each species' live size: its battle extent (battle-creature-size.ts), which the visible standby pose
 * fills, times the mesh's size over that pose's (`standbySize`, runtime-index.json), up to about 3.3 creature boxes for 300,
 * whose mesh is 2.5 times its visible pose. The creature's own motion is measured here on its own: the sprites (atlas
 * regions) the standby draws, each copy matched to the nearest copy in the frame before.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root, suite, withSsr} from './_harness.mjs';

const NAME = 'battle-move-clips';
const MOVES = ['attack', 'sa', 'cp', 'hited'];
/** The moves that land a hit; a hit reaction (hited) has no marker. */
const HITS = ['attack', 'sa', 'cp'];
/** The canvas host's layout size: 1.7 creature boxes (BattleCreatureAnimation.css). */
const HOST = 442;
/** Arena boxes relative to the host's top-left, x measured toward the opponent; the same for both sides. */
const ROOMS = {
  '1000x650': {behind: -18.2, ahead: 941.8, top: -83.2, bottom: 413.2},
  '1280x800': {behind: -39.3, ahead: 1024.2, top: -111, bottom: 441},
};
/** Standby mesh extents, in creature boxes, checked for every species besides its live one. */
const EXTENTS = [0.4, 0.8, 1.4, 2];
/** A frame-to-frame step of the offset beyond the creature's own motion that the eye catches, in standby sizes. */
const JUMP = 0.05;
/** 鲁斯王's special attack, at its live size and smaller: its parts never leave the arena, so nothing moves it. */
const REPORTED = {species: 306, sequence: 'sa'};
/** 闪光波克尔's attack climbs far above the arena; at its live size and smaller, this share of its parts stays inside on every frame. */
const CLIMB = {species: 166, sequence: 'attack', inside: 0.9};

const index = JSON.parse(fs.readFileSync(path.join(root, 'public/battle-animations/runtime-index.json'))).species;

function loadClip(id) {
  const meta = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'public', index[id].meta))));
  return {sequences: meta.sequences.map(s => ({name: s.name, frames: s.frames.map(f => ({labels: f.labels,
    mesh: {positions: f.positions, uvs: f.uvs, mulColors: f.mulColors, indices: f.indices}}))}))};
}

/** The visible quads of a frame: atlas region (UV rect), area, centre and extent. */
function quads({mesh: {positions: p, uvs, mulColors}}) {
  const out = [];
  for (let q = 0; q < p.length / 8; q++) {
    if (![0, 1, 2, 3].some(k => mulColors[(q * 4 + k) * 4 + 3] > 0)) continue;
    const corner = k => ({x: p[(q * 4 + k) * 2], y: p[(q * 4 + k) * 2 + 1], u: uvs[(q * 4 + k) * 2], v: uvs[(q * 4 + k) * 2 + 1]});
    const c = [0, 1, 2, 3].map(corner), xs = c.map(v => v.x), ys = c.map(v => v.y), us = c.map(v => v.u), vs = c.map(v => v.v);
    const area = Math.abs(c.reduce((sum, v, k) => sum + v.x * c[(k + 1) % 4].y - c[(k + 1) % 4].x * v.y, 0)) / 2;
    out.push({region: [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)].join(), area,
      x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2,
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)});
  }
  return out;
}

const weightedMedian = entries => {
  entries.sort((a, b) => a[0] - b[0]);
  let remaining = entries.reduce((sum, [, w]) => sum + w, 0) / 2;
  for (const [value, w] of entries) if ((remaining -= w) <= 0) return value;
  return entries.at(-1)[0];
};
/**
 * Area-weighted median displacement of quads matched by region: copies in drawing order while their number holds, else each
 * to the nearest unmatched copy; null without a match.
 */
function matched(before, after) {
  const earlier = Object.groupBy(before, q => q.region), later = Object.groupBy(after, q => q.region), dx = [], dy = [];
  for (const [region, copies] of Object.entries(later)) {
    const left = earlier[region] ?? [], same = left.length === copies.length;
    for (const [k, q] of copies.entries()) {
      if (!left.length) break;
      const nearest = left.reduce((best, c, i) => Math.hypot(c.x - q.x, c.y - q.y) < Math.hypot(left[best].x - q.x, left[best].y - q.y) ? i : best, 0);
      const [c] = left.splice(same ? 0 : nearest, 1);
      dx.push([q.x - c.x, q.area]); dy.push([q.y - c.y, q.area]);
    }
  }
  return dx.length ? {x: Math.abs(weightedMedian(dx)), y: Math.abs(weightedMedian(dy))} : null;
}
const overlap = (a, b) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const extentOf = list => list.reduce((u, q) => ({minX: Math.min(u.minX, q.minX), maxX: Math.max(u.maxX, q.maxX), minY: Math.min(u.minY, q.minY),
  maxY: Math.max(u.maxY, q.maxY)}), {minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity});
const largest = list => list.reduce((a, b) => b.area > a.area ? b : a);
/**
 * The creature's own motion between two drawn frames: its parts, else any sprite both draw, else a redrawing in place; null
 * when nothing visible carries on.
 */
function motion(before, after, own) {
  const mine = list => list.filter(q => own.has(q.region));
  const parts = matched(mine(before), mine(after)) ?? matched(before, after);
  if (parts || !overlap(extentOf(before), extentOf(after))) return parts;
  const a = largest(before), b = largest(after);
  return {x: Math.abs(b.x - a.x), y: Math.abs(b.y - a.y)};
}

/** Share of the own quads' area inside `room` once offset. */
function insideShare(list, offset, room) {
  let total = 0, inside = 0;
  for (const q of list) {
    const w = q.maxX - q.minX, h = q.maxY - q.minY;
    total += w * h;
    inside += Math.max(0, Math.min(q.maxX + offset.x, room.maxX) - Math.max(q.minX + offset.x, room.minX))
      * Math.max(0, Math.min(q.maxY + offset.y, room.maxY) - Math.max(q.minY + offset.y, room.minY));
  }
  return total ? inside / total : 1;
}

await withSsr(NAME, async load => {
  const {containPath, sequencePaths} = await load('/src/features/battle/battle-animation-path.ts');
  const {fixedAnimationTransform, standbyMeshBounds} = await load('/src/features/battle/battle-animation-registration.ts');
  const {battleCreatureExtent} = await load('/src/features/battle/battle-creature-size.ts');
  const {battleAnimationHitFrames} = await load('/src/features/battle/battle-animation.ts');
  const t = suite(NAME), jumps = [], ends = [], reported = [], climb = [];
  let sequences = 0, worst = {excess: 0}, widest = {extent: 0};
  for (const id of Object.keys(index)) {
    const clip = loadClip(id), home = standbyMeshBounds(clip), size = Math.max(home.maxX - home.minX, home.maxY - home.minY);
    const standby = clip.sequences.find(s => s.name === 'standby') ?? clip.sequences[0];
    const own = new Set(standby.frames.flatMap(f => quads(f).map(q => q.region))), paths = sequencePaths(clip, home, battleAnimationHitFrames(+id));
    const live = battleCreatureExtent(+id) * size / index[id].standbySize, extents = [...EXTENTS, live];
    if (live > widest.extent) widest = {extent: live, species: +id};
    for (const sequence of clip.sequences.filter(s => MOVES.includes(s.name) && s.frames.length)) {
      sequences++;
      const drawn = sequence.frames.map(quads), shown = drawn.flatMap((list, i) => list.length ? [i] : []);
      const motions = drawn.map((list, i) => i && list.length && drawn[i - 1].length ? motion(drawn[i - 1], list, own) : null);
      for (const [roomName, room] of Object.entries(ROOMS)) for (const extent of extents) {
        const {position, scale} = fixedAnimationTransform(home, HOST, HOST, extent);
        const ys = [(room.bottom - position.y) / scale.y, (room.top - position.y) / scale.y];
        const mesh = {minX: (room.behind - position.x) / scale.x, maxX: (room.ahead - position.x) / scale.x, minY: Math.min(...ys), maxY: Math.max(...ys)};
        const {offsets} = containPath(paths.get(sequence.name), home, mesh), where = `${id} ${sequence.name} ${roomName} extent ${extent.toFixed(2)}`;
        motions.forEach((m, i) => {
          if (!m) return;
          const excess = Math.max(Math.abs(offsets[i].x - offsets[i - 1].x) - m.x, Math.abs(offsets[i].y - offsets[i - 1].y) - m.y) / size;
          if (excess > worst.excess) worst = {excess, where, frame: i};
          if (excess > JUMP) jumps.push(`${where} frame ${i}: ${excess.toFixed(3)}`);
        });
        for (const i of [shown[0], shown.at(-1)]) if (i !== undefined && Math.hypot(offsets[i].x, offsets[i].y) / size > JUMP) ends.push(`${where} frame ${i}`);
        const shows = ({species, sequence: name}) => +id === species && sequence.name === name && extent <= live;
        if (shows(REPORTED) && offsets.some(o => o.x || o.y)) reported.push(where);
        if (shows(CLIMB)) drawn.forEach((list, i) => {
          const share = insideShare(list.filter(q => own.has(q.region)), offsets[i], mesh);
          if (share < CLIMB.inside) climb.push(`${where} frame ${i}: ${share.toFixed(3)}`);
        });
      }
    }
  }
  const unmarked = Object.keys(index).flatMap(id => [...battleAnimationHitFrames(+id)].filter(([name, hit]) => HITS.includes(name) && hit < 0)
    .map(([name]) => `${id} ${name}`));
  t.witness('sequences', sequences);
  t.witness('worst', worst);
  t.witness('largest live extent', widest);
  t.check(`Offsets never step more than ${JUMP} standby sizes beyond the creature's own motion`, () => assert.deepEqual(jumps.slice(0, 20), []));
  t.check('Every move starts and ends at rest', () => assert.deepEqual(ends.slice(0, 20), []));
  t.check(`${REPORTED.species}'s ${REPORTED.sequence}, its beam flickering beside it, keeps the creature where the clip puts it`,
    () => assert.deepEqual(reported, []));
  t.check(`${CLIMB.species}'s ${CLIMB.sequence} keeps ${CLIMB.inside} of its parts inside the arena`, () => assert.deepEqual(climb.slice(0, 20), []));
  t.check(`Every ${HITS.join(', ')} clip has a hit marker`, () => assert.deepEqual(unmarked, []));
  t.finish({rooms: ROOMS, extents: EXTENTS, jumps: jumps.length, ends: ends.length});
});
