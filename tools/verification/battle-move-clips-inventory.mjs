/**
 * Inventory of every species' original move clips (attack, sa, cp, hited): length, hit marker, how the creature is drawn
 * (its own standby sprites, sprites only the move draws, copies of itself), how far the drawing and the creature reach, and
 * which of its special skills bring their own skill effect (getSkillEffect, so those counts follow the skill-effect export of
 * the day). Status `tool`: writes artifacts/battle-move-clips/inventory.json and prints a summary;
 * design/notes/battle-move-clips-audit-2026-10-21.md reads it. Needs the ignored clips in public/.
 */
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {root, withSsr} from './_harness.mjs';

const MOVES = ['attack', 'sa', 'cp', 'hited'];
const HIT_LABEL = 'action_hit';
/** A drawing that reaches this many standby sizes beyond home on some side is a huge extent. */
const HUGE_REACH = 4;
const OUT = path.join(root, 'artifacts/battle-move-clips/inventory.json');

const index = JSON.parse(fs.readFileSync(path.join(root, 'public/battle-animations/runtime-index.json'))).species;
const skills = new Map(JSON.parse(fs.readFileSync(path.join(root, 'data/skills.json'))).map(skill => [skill.id, skill]));
const monster = id => {
  const file = path.join(root, `data/monsters/${String(id).padStart(4, '0')}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : null;
};

/** The visible quads of a frame: atlas region (UV rect) and vertex extent. */
function quads({positions: p, uvs, mulColors}) {
  const out = [];
  for (let q = 0; q < p.length / 8; q++) {
    if (![0, 1, 2, 3].some(k => mulColors[(q * 4 + k) * 4 + 3] > 0)) continue;
    const at = (list, k, axis) => list[(q * 4 + k) * 2 + axis], ks = [0, 1, 2, 3];
    const xs = ks.map(k => at(p, k, 0)), ys = ks.map(k => at(p, k, 1)), us = ks.map(k => at(uvs, k, 0)), vs = ks.map(k => at(uvs, k, 1));
    out.push({region: [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)].join(),
      minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)});
  }
  return out;
}

/** How far boxes reach beyond home on each side, in standby sizes (0 inside it). */
function reach(boxes, home, size) {
  const shown = boxes.filter(b => b.minX <= b.maxX), side = pick => Math.max(0, ...shown.map(pick)) / size;
  return {forward: side(b => b.maxX - home.maxX), back: side(b => home.minX - b.minX), up: side(b => b.maxY - home.maxY), down: side(b => home.minY - b.minY)};
}
const round = value => Math.round(value * 100) / 100;
const rounded = sides => Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, round(v)]));

/** One move sequence's record. */
function moveRecord(sequence, {frameRate, own, copies, home, size, path: travel}) {
  const drawn = sequence.frames.map(frame => quads(frame.mesh)), hitFrame = sequence.frames.findIndex(f => f.labels.includes(HIT_LABEL));
  const effectRegions = new Set(drawn.flat().filter(q => !own.has(q.region)).map(q => q.region));
  const counted = list => Object.entries(Object.groupBy(list.filter(q => own.has(q.region)), q => q.region));
  const body = travel.bodies[hitFrame >= 0 ? hitFrame : 0], middle = (home.minX + home.maxX) / 2;
  return {
    frames: sequence.frames.length, durationMs: Math.round(sequence.frames.length / frameRate * 1000),
    hitFrame: hitFrame >= 0 ? hitFrame : null, hitMs: hitFrame >= 0 ? Math.round(hitFrame / frameRate * 1000) : null,
    labels: [...new Set(sequence.frames.flatMap(f => f.labels))],
    emptyFrames: drawn.filter(list => !list.length).length,
    redrawnFrames: drawn.filter(list => list.length && !list.some(q => own.has(q.region))).length,
    effectSprites: effectRegions.size, effectFrames: drawn.filter(list => list.some(q => !own.has(q.region))).length,
    copyFrames: drawn.filter(list => counted(list).some(([region, list]) => list.length > copies.get(region))).length,
    drawingReach: rounded(reach(sequence.frames.map((_, i) => travel.extents[i]), home, size)),
    bodyReach: rounded(reach(travel.bodies, home, size)),
    hitBodyBehindHome: body.minX <= body.maxX && (body.minX + body.maxX) / 2 < middle - size / 2,
  };
}

/** A species' record: its move clips, and its special skills with or without their own skill effect. */
function speciesRecord(id, {sequencePaths, standbyMeshBounds, getSkillEffect}) {
  const meta = JSON.parse(gunzipSync(fs.readFileSync(path.join(root, 'public', index[id].meta))));
  const clip = {sequences: meta.sequences.map(s => ({name: s.name, frames: s.frames.map(f => ({labels: f.labels, mesh: f}))}))};
  const standby = clip.sequences.find(s => s.name === 'standby') ?? clip.sequences[0], home = standbyMeshBounds(clip);
  const own = new Set(), copies = new Map();
  for (const frame of standby.frames) for (const [region, list] of Object.entries(Object.groupBy(quads(frame.mesh), q => q.region))) {
    own.add(region);
    copies.set(region, Math.max(copies.get(region) ?? 0, list.length));
  }
  const paths = sequencePaths(clip, home), size = Math.max(home.maxX - home.minX, home.maxY - home.minY), data = monster(id);
  const special = [...new Set((data?.learnset ?? []).map(entry => entry.skill))].filter(skill => skills.get(skill)?.category === 'special');
  const moves = Object.fromEntries(MOVES.map(name => {
    const sequence = clip.sequences.find(s => s.name === name && s.frames.length);
    return [name, sequence ? moveRecord(sequence, {frameRate: meta.frameRate, own, copies, home, size, path: paths.get(name)}) : null];
  }));
  return {id: +id, name: data?.name?.zh ?? null, frameRate: meta.frameRate, standbyFrames: standby.frames.length, standbySprites: own.size, moves,
    specialSkills: special.length, specialSkillsWithEffect: special.filter(skill => getSkillEffect(skill)).length};
}

/** Counts over the inventory for the design note. */
function summarize(records) {
  const summary = {species: records.length};
  for (const name of MOVES) {
    const moves = records.map(r => r.moves[name]).filter(Boolean), count = test => moves.filter(test).length;
    summary[name] = {
      missing: records.length - moves.length, withHit: count(m => m.hitFrame !== null),
      frames: {min: Math.min(...moves.map(m => m.frames)), median: moves.map(m => m.frames).sort((a, b) => a - b)[moves.length >> 1],
        max: Math.max(...moves.map(m => m.frames))},
      withEffectSprites: count(m => m.effectSprites), redrawn: count(m => m.redrawnFrames), mostlyRedrawn: count(m => m.redrawnFrames > m.frames / 2),
      withCopies: count(m => m.copyFrames), withEmptyFrames: count(m => m.emptyFrames),
      hugeDrawing: count(m => Math.max(...Object.values(m.drawingReach)) >= HUGE_REACH), hitBehindHome: count(m => m.hitBodyBehindHome),
    };
  }
  summary.specialSkills = {species: records.filter(r => r.specialSkills).length,
    allWithEffect: records.filter(r => r.specialSkills && r.specialSkillsWithEffect === r.specialSkills).length,
    noneWithEffect: records.filter(r => r.specialSkills && !r.specialSkillsWithEffect).length};
  return summary;
}

await withSsr('battle-move-clips-inventory', async load => {
  const modules = {...await load('/src/features/battle/battle-animation-path.ts'), ...await load('/src/features/battle/battle-animation-registration.ts'),
    ...await load('/src/features/battle/battle-skill-effects.ts')};
  const records = Object.keys(index).map(id => speciesRecord(id, modules)), summary = summarize(records);
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify({summary, species: records}, null, 1) + '\n');
  console.log(JSON.stringify(summary, null, 1));
});
