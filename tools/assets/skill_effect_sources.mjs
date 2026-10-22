#!/usr/bin/env node
/**
 * Skill effects in battle scope, and their exact official skill-ID SWFs.
 *
 * Scope: every skill a catalog species can learn (`data/monsters/*.json` learnsets, including the
 * special task-taught entries) plus every skill an authored opponent or reward names in `data/bosses`,
 * `data/trainers`, `data/elite-roster.json` and `data/npc-training-profiles.json` (`skills` arrays and
 * scalar `skill` fields). Run as a script, it probes the official BefLoad route for each in-scope ID
 * with at most four concurrent requests, caches every SWF and writes `probe.json` beside them
 * (`node skill_effect_sources.mjs [sourcesDir]`); `--scope` only prints the scope as JSON.
 * Another skill's art is never substituted: an ID without its own SWF is recorded as missing.
 * Behind an HTTP proxy, run with `NODE_USE_ENV_PROXY=1` so `fetch` honours `HTTPS_PROXY`.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const skillEffectUrl = id => `https://seer.61.com/resource/fightResource/skill/swf/${id}.swf`;

/** Integer skill IDs held by `skills` arrays and scalar `skill` fields anywhere in `value`. */
function namedSkills(value, out, key) {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (key === 'skills' && Number.isInteger(item)) out.add(item);
      else namedSkills(item, out);
    }
  } else if (value && typeof value === 'object') {
    for (const [name, item] of Object.entries(value)) namedSkills(item, out, name);
  } else if (key === 'skill' && Number.isInteger(value)) out.add(value);
}

/** Sorted catalog skill IDs that can appear in a battle. */
export function skillEffectScope(dataDir = path.join(root, 'data')) {
  const json = file => JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
  const records = dir => fs.readdirSync(path.join(dataDir, dir)).filter(name => name.endsWith('.json') && !name.startsWith('.'))
    .map(name => json(`${dir}/${name}`));
  const catalog = new Set(json('skills.json').map(skill => skill.id));
  const ids = new Set();
  for (const monster of records('monsters')) for (const row of monster.learnset) ids.add(row.skill);
  for (const record of [...records('bosses'), ...records('trainers'), json('elite-roster.json'), json('npc-training-profiles.json')]) {
    namedSkills(record, ids);
  }
  const unknown = [...ids].filter(id => !catalog.has(id));
  if (unknown.length) throw new Error(`Battle data names skills missing from data/skills.json: ${unknown.join(', ')}`);
  return [...ids].sort((a, b) => a - b);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const isSwf = bytes => ['FWS', 'CWS', 'ZWS'].includes(bytes.subarray(0, 3).toString('latin1'));

/** One ID: a cached or downloaded SWF, a definite absence, or an error after retries. */
async function probe(id, sources, attempts = 4) {
  const file = path.join(sources, `${id}.swf`);
  if (fs.existsSync(file)) {
    const bytes = fs.readFileSync(file);
    return {id, status: 'swf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  }
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(skillEffectUrl(id), {headers: {'User-Agent': 'Mozilla/5.0'}, signal: AbortSignal.timeout(30_000)});
      const bytes = Buffer.from(await response.arrayBuffer());
      if (response.status === 404) return {id, status: 'missing', http: 404};
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!isSwf(bytes)) return {id, status: 'not-swf', http: response.status, contentType: response.headers.get('content-type'), bytes: bytes.length};
      fs.writeFileSync(`${file}.part`, bytes);
      fs.renameSync(`${file}.part`, file);
      return {id, status: 'swf', http: response.status, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
    } catch (error) {
      last = String(error.message || error);
      await sleep(1000 * 2 ** attempt);
    }
  }
  return {id, status: 'error', error: last};
}

async function main() {
  if (process.argv[2] === '--scope') {
    console.log(JSON.stringify(skillEffectScope()));
    return;
  }
  const sources = path.resolve(process.argv[2] || path.join(root, '.cache/skill-effects/sources'));
  fs.mkdirSync(sources, {recursive: true});
  const ids = skillEffectScope();
  const rows = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++];
      rows.push(await probe(id, sources));
      if (rows.length % 250 === 0) console.log(`${rows.length}/${ids.length}`);
    }
  };
  await Promise.all(Array.from({length: 4}, worker));
  rows.sort((a, b) => a.id - b.id);
  const summary = Object.fromEntries(['swf', 'missing', 'not-swf', 'error'].map(status => [status, rows.filter(row => row.status === status).length]));
  fs.writeFileSync(path.join(sources, 'probe.json'), JSON.stringify({route: skillEffectUrl('<skill-id>'), scope: ids.length, summary, rows}, null, 1) + '\n');
  console.log(JSON.stringify({scope: ids.length, ...summary}));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
