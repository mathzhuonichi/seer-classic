/**
 * V58 battle clone fidelity (design/notes/trainer-search-ai-v58.md 9.1 and 12.1).
 *
 * Over real-data battles, at every turn:
 * - clone the battle and check that the clone equals the original in every
 *   mutable field and shares no mutable object with it;
 * - resolve 1-3 extra turns on a second clone and check that the original's
 *   full state, `state` and `log` are unchanged;
 * - resolve the same actions on the original and on the first clone (same RNG
 *   state) and check that events, `state` and every mutable field match.
 *
 * Corpus: random and elite facility teams on both sides, the classic trainer
 * teams (normalized as createFacilityEncounter does), script-heavy facility
 * teams, synthetic teams that carry every catalog skill with a script effect,
 * and every Boss encounter. Side 0 is either a player with explicit actions or
 * an AI trainer; explicit moves, switches and items are mixed in on both sides.
 *
 * Trainer sides play explicit actions, because the search planner is slow, except in
 * the nested-planner category, which runs the search planner so that its own clones
 * are exercised inside real turns. Other automatic sides (bosses) are left to the AI
 * at random, and every faint replacement of an automatic side is the AI's.
 *
 * Usage: node tools/verification/battle-clone-fidelity-v58.mjs [--quick] [--json <file>] [--shard k/n]
 * --shard runs only corpus items whose index is k modulo n; the parallel launcher
 * tools/verification/parallel-shards.mjs runs all shards at once.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quick = process.argv.includes('--quick');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : undefined;
const [shardIndex, shardCount] = process.argv.includes('--shard') ? process.argv[process.argv.indexOf('--shard') + 1].split('/').map(Number) : [0, 1];
const previousFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error('Clone fidelity verification must remain offline.'); };

const server = await createServer({
  root, configFile: false, cacheDir: path.join(root, 'artifacts/.validation-cache/battle-clone-fidelity-v58'),
  server: {middlewareMode: true, watch: null, hmr: false, ws: false}, optimizeDeps: {noDiscovery: true, include: []},
  appType: 'custom', logLevel: 'error',
});

let exitCode = 0;
try {
  const load = (id) => server.ssrLoadModule(id);
  const [core, {createBattle}, {cloneBattle}, {SEER_SCRIPTS}, facilities, {npcTrainingScripts}, {traitScripts, traits}, {campaignScripts}, {loadCatalog}, supplies, {normalizeNpcTrainingEncounter}] = await Promise.all([
    '/battle/core/src/index.ts', '/tools/verification/_battle.ts', '/battle/ai/src/clone.ts', '/battle/core/src/scripts/index.ts', '/src/domain/challenges/battle-facilities.ts',
    '/src/domain/challenges/npc-training-scripts.ts', '/src/domain/traits.ts', '/src/domain/challenges/campaign-rules.ts', '/src/domain/catalog/catalog.ts',
    '/src/domain/battle-supplies.ts', '/src/domain/challenges/npc-training.ts',
  ].map(load));
  const {buildDataSet, Rng, STRUGGLE_SKILL} = core;
  const {createFacilityEncounter, facilityPool} = facilities;

  // Game-equivalent catalog (src/domain/catalog/enrichment.ts), data set (src/kernel/context.ts) and script registry (src/features/battle/battle-setup.ts).
  const loaded = await loadCatalog();
  const catalog = {...loaded, items: supplies.normalizeBattleSupplyItems(loaded.items), bosses: structuredClone(loaded.bosses)};
  const data = buildDataSet(catalog);
  const scripts = {...SEER_SCRIPTS, ...traitScripts, ...campaignScripts, ...npcTrainingScripts};
  // Nested planner probe: while the original resolves a turn, the engine asks the
  // AI for an action (choose_action fires right before chooseAiAction). The probe
  // clones the battle at that point and resolves turns on the clone, as the
  // search planner will. It is armed only while the original resolves.
  const probe = {armed: false, runs: 0, nestedTurns: 0};
  scripts.clone_fidelity_probe = {hook: (c) => {
    if (!probe.armed) return undefined;
    probe.armed = false;
    try {
      const nested = cloneBattle(c.battle), d = new Rng(c.battle.turn * 31 + c.holder.side * 7 + c.holder.slot);
      for (let k = 0; k < 2 && !nested.result; k++) { apply(nested, chooseSubmissions(nested, d, {explicitAll: true})); probe.nestedTurns++; }
      probe.runs++;
    } finally { probe.armed = true; }
    return undefined;
  }};
  const implementedTraits = traits.filter((t) => t.implemented);
  const scriptIdsOf = (skill) => (skill?.effects ?? []).filter((op) => op.op === 'script').map((op) => op.id);
  const scriptSkills = [...data.skills.values()].filter((skill) => scriptIdsOf(skill).length);
  const allScriptIds = new Set(scriptSkills.flatMap(scriptIdsOf));

  // ---------- serialization ----------

  const SHARED_BATTLE = new Set(['data', 'scripts', 'encounter', 'variant', 'policy']);
  const EVENT_LISTS = new Set(['log', 'initialEvents']);
  const SHARED_KEYS = new Set(['def', 'species']);
  const staticIds = new Map([[STRUGGLE_SKILL, 'skill:struggle']]);
  for (const [kind, map] of Object.entries({species: data.species, skill: data.skills, condition: data.conditions, item: data.items, nature: data.natures})) {
    staticIds.set(map, `map:${kind}`);
    for (const [id, value] of map) staticIds.set(value, `${kind}:${id}`);
  }
  staticIds.set(data.types, 'types'); staticIds.set(data, 'data');
  const scalar = (v) => v === undefined ? '$undef' : typeof v === 'number' && !Number.isFinite(v) ? `$num:${v}` : typeof v === 'function' ? `$fn:${v.name}` : typeof v === 'bigint' ? `$big:${v}` : v;
  const eventsJson = (events) => JSON.stringify(events, (_k, v) => (v !== null && typeof v === 'object') ? v : scalar(v));
  const stateJson = (b) => eventsJson(b.state);

  /** Every mutable field, in order, with aliasing written as back-references. Shared objects are written by identity. */
  function fingerprint(b) {
    const ids = new Map();
    const walk = (v, key) => {
      if (v === null || typeof v !== 'object') return scalar(v);
      if (staticIds.has(v)) return `$static:${staticIds.get(v)}`;
      if (key === 'def') return {$def: v.id, body: JSON.stringify(v, (_k, x) => (x !== null && typeof x === 'object') ? x : scalar(x))};
      if (key === 'species') return `$species:${v.id}`;
      if (ids.has(v)) return {$ref: ids.get(v)};
      ids.set(v, ids.size);
      if (Array.isArray(v)) return v.map((x) => walk(x));
      if (v instanceof Map) return {$map: [...v].map(([k, x]) => [walk(k), walk(x)])};
      if (v instanceof Set) return {$set: [...v].map((x) => walk(x))};
      const proto = Object.getPrototypeOf(v);
      const out = proto === Object.prototype ? {} : {$class: proto?.constructor?.name ?? 'null'};
      for (const k of Object.keys(v)) out[k] = walk(v[k], k);
      return out;
    };
    const out = {};
    for (const k of Object.keys(b)) {
      if (SHARED_BATTLE.has(k)) out[k] = b[k] === undefined ? '$undef' : `$shared:${k}`;
      else if (EVENT_LISTS.has(k)) out[k] = {length: b[k].length, events: eventsJson(b[k])};
      else out[k] = walk(b[k], k);
    }
    return JSON.stringify(out);
  }

  /** Mutable objects reachable from a battle, following the clone's sharing rules. */
  function mutableObjects(b) {
    const found = new Set();
    const walk = (v, key) => {
      if (v === null || typeof v !== 'object' || staticIds.has(v) || SHARED_KEYS.has(key) || found.has(v)) return;
      found.add(v);
      if (v instanceof Map) for (const [k, x] of v) { walk(k); walk(x); }
      else if (v instanceof Set) for (const x of v) walk(x);
      else for (const k of Object.keys(v)) walk(v[k], k);
    };
    found.add(b);
    for (const k of Object.keys(b)) {
      if (SHARED_BATTLE.has(k)) continue;
      if (EVENT_LISTS.has(k)) { found.add(b[k]); continue; }
      walk(b[k], k);
    }
    return found;
  }
  function sharedMutable(a, b) {
    const left = mutableObjects(a), shared = [];
    for (const v of mutableObjects(b)) if (left.has(v)) shared.push(v);
    return shared;
  }

  // ---------- teams ----------

  const pool = facilityPool(catalog);
  const randomTeam = (rng, facility) => createFacilityEncounter(catalog, facility, rng).team;
  const classicTeams = catalog.trainers.map((t) => t.id);
  const classicTeam = (id) => createFacilityEncounter(catalog, 'classic', new Rng(1), id).team;
  /** Facility builds whose skills carry script effects, six per team. */
  function scriptHeavyTeam(rng, facility) {
    const out = [];
    for (let guard = 0; out.length < 6 && guard < 50; guard++) {
      for (const member of randomTeam(rng, facility)) {
        if (out.length < 6 && member.skills.some((id) => scriptIdsOf(data.skills.get(id)).length)) out.push(member);
      }
    }
    return out;
  }
  /** Synthetic teams that carry every scripted catalog skill (four per monster). */
  function coverageTeams(rng) {
    const skills = [...scriptSkills].map((s) => s.id);
    for (let i = skills.length - 1; i > 0; i--) { const j = rng.int(0, i); [skills[i], skills[j]] = [skills[j], skills[i]]; }
    const teams = [];
    for (let i = 0; i < skills.length; i += 24) {
      const chunk = skills.slice(i, i + 24), team = [];
      for (let k = 0; k < chunk.length; k += 4) {
        // Extra HP lets each holder live long enough to use all four skills.
        team.push({species: pool[rng.int(0, pool.length - 1)].id, level: 100, iv: 31, evs: {hp: 255, atk: 255}, nature: 'hardy', hp_override: 1500, skills: chunk.slice(k, k + 4)});
      }
      teams.push(team);
    }
    return teams;
  }
  const PLAYER_ITEMS = {item_potion_hp_50: 3, item_potion_hp_200: 1, item_potion_pp_10: 2, item_status_cure: 2};

  function side0(kind, team, rng, {withTraits}) {
    if (kind === 'trainer') return {kind: 'trainer', name: 'mirror trainer', team, unlimited_items: [...supplies.TRAINER_UNLIMITED_ITEMS], ai: {kind: 'smart', allow_switch: true, style: rng.pick(['balanced', 'offense', 'control', 'attrition'])}};
    return {kind: 'player', name: 'player', team: team.map((m, slot) => ({...m, uid: `p${slot}`})), items: {...PLAYER_ITEMS}, traits: withTraits};
  }
  function attachTraits(battle, rng) {
    // As src/features/battle/battle-setup.ts does for the player's monsters.
    for (const mon of battle.sides[0].team) {
      const trait = rng.pick(implementedTraits);
      mon.conditions.push({id: `trait-${trait.id}`, def: {id: `trait-${trait.id}`, name: {zh: trait.name}, kind: 'buff', removed_on_switch: false, hooks: trait.hooks}, turns: Infinity, appliedTurn: 0});
    }
  }
  function trainerEncounter(team, facility) {
    return {id: `clone_fidelity_${facility}`, name: {zh: 'clone fidelity'}, category: 'trainer', facility, team, rules: [{rule: 'no_capture'}], win: [{kind: 'ko_all'}], lose: [], phases: [], ai: {kind: 'smart', allow_switch: true, style: 'balanced'}};
  }

  // ---------- corpus ----------

  const corpus = [];
  const n = (full, small) => quick ? small : full;
  const add = (category, seed, build) => corpus.push({category, seed, build});
  for (const facility of ['random', 'elite']) {
    for (let i = 0; i < n(facility === 'random' ? 60 : 40, 6); i++) {
      const seed = 58000 + corpus.length;
      add(`${facility}`, seed, (rng) => {
        const kind = i % 3 === 2 ? 'trainer' : 'player';
        return {sides: [side0(kind, randomTeam(rng, facility), rng, {withTraits: i % 2 === 0}), {kind: 'trainer', unlimited_items: [...supplies.TRAINER_UNLIMITED_ITEMS]}], encounter: createFacilityEncounter(catalog, facility, rng)};
      });
    }
  }
  for (const id of classicTeams) {
    for (let i = 0; i < n(4, 1); i++) {
      const seed = 58000 + corpus.length;
      add('classic', seed, (rng) => {
        const kind = i % 2 === 1 ? 'trainer' : 'player';
        const own = i === 2 ? classicTeam(rng.pick(classicTeams)) : randomTeam(rng, i % 2 ? 'elite' : 'random');
        return {sides: [side0(kind, own, rng, {withTraits: i === 0}), {kind: 'trainer', unlimited_items: [...supplies.TRAINER_UNLIMITED_ITEMS]}], encounter: createFacilityEncounter(catalog, 'classic', rng, id)};
      });
    }
  }
  for (let i = 0; i < n(30, 4); i++) {
    const seed = 58000 + corpus.length;
    add('script-heavy', seed, (rng) => {
      const facility = i % 2 ? 'elite' : 'random';
      const kind = i % 3 === 1 ? 'trainer' : 'player';
      return {sides: [side0(kind, scriptHeavyTeam(rng, facility), rng, {withTraits: i % 2 === 0}), {kind: 'trainer', unlimited_items: [...supplies.TRAINER_UNLIMITED_ITEMS]}],
        encounter: normalizeNpcTrainingEncounter(catalog, trainerEncounter(scriptHeavyTeam(rng, facility), facility))};
    });
  }
  {
    const teams = coverageTeams(new Rng(58058));
    for (let round = 0; round < n(3, 1); round++) {
      for (let t = 0; t < teams.length; t++) {
        const seed = 58000 + corpus.length;
        const own = teams[t], foe = teams[(t + 1 + round) % teams.length];
        add('script-coverage', seed, (rng) => ({
          sides: [side0(round === 2 ? 'trainer' : 'player', own, rng, {withTraits: round === 0}), {kind: 'trainer', unlimited_items: [...supplies.TRAINER_UNLIMITED_ITEMS]}],
          encounter: trainerEncounter(foe, 'random'),
        }));
      }
    }
  }
  for (let i = 0; i < n(30, 4); i++) {
    const seed = 58000 + corpus.length, facility = ['random', 'elite', 'classic'][i % 3];
    corpus.push({category: 'nested-planner', seed, probe: true, build: (rng) => ({
      sides: [side0(i % 2 ? 'trainer' : 'player', randomTeam(rng, i % 2 ? 'elite' : 'random'), rng, {withTraits: i % 4 === 0}), {kind: 'trainer', unlimited_items: [...supplies.TRAINER_UNLIMITED_ITEMS]}],
      encounter: createFacilityEncounter(catalog, facility, rng, facility === 'classic' ? rng.pick(classicTeams) : undefined),
    })});
  }
  const bosses = quick ? catalog.bosses.slice(0, 12) : catalog.bosses;
  for (const boss of bosses) {
    const seed = 58000 + corpus.length;
    add('boss', seed, (rng) => {
      const encounter = normalizeNpcTrainingEncounter(catalog, structuredClone(boss));
      const variant = encounter.variants?.length ? rng.pick(encounter.variants).id : undefined;
      const levelCap = (encounter.rules ?? []).find((r) => r.rule === 'player_level_cap')?.level;
      const size = (encounter.rules ?? []).find((r) => r.rule === 'player_team_size')?.max ?? 6;
      const team = randomTeam(rng, 'elite').slice(0, size).map((m) => ({...m, level: Math.min(m.level, levelCap ?? 100)}));
      return {sides: [side0('player', team, rng, {withTraits: true}), {kind: encounter.category === 'trainer' ? 'trainer' : 'boss'}], encounter, variant};
    });
  }

  // ---------- driver ----------

  /** Deterministic action mix for one side; uses the driver RNG only. */
  function pickAction(b, side, drv, {replace, preferUnused}) {
    const legal = b.legalActions(side);
    if (replace) return drv.pick(legal.filter((a) => a.kind === 'switch'));
    const moves = legal.filter((a) => a.kind === 'move'), switches = legal.filter((a) => a.kind === 'switch'), items = legal.filter((a) => a.kind === 'item');
    // Coverage battles try each skill of the active monster before anything else.
    const mon = b.active(side), fresh = moves.filter((a) => !mon.usedSkills.has(a.skill));
    if (preferUnused && fresh.length) return drv.pick(fresh);
    const r = drv.next();
    if (r < 0.002 && b.sides[side].kind === 'player') return {kind: 'flee'};
    if (items.length && r < 0.12) return drv.pick(items);
    if (switches.length && r < 0.27) return drv.pick(switches);
    return drv.pick(moves.length ? moves : legal);
  }
  /** Actions submitted this turn; sides left out are decided by the engine's AI. */
  function chooseSubmissions(b, drv, {explicitAll = false, explicitTrainers = false, preferUnused = false} = {}) {
    const subs = [];
    if (b.phase === 'replace') {
      for (const s of [0, 1]) if (b.sides[s].needsReplacement && b.needsInput(s)) subs.push([s, pickAction(b, s, drv, {replace: true})]);
      return subs;
    }
    for (const s of [0, 1]) {
      const auto = !b.needsInput(s), explicit = explicitAll || (explicitTrainers && b.sides[s].kind === 'trainer');
      if (!auto || explicit || drv.chance(s === 0 ? 30 : 15)) subs.push([s, pickAction(b, s, drv, {replace: false, preferUnused: preferUnused && s === 0})]);
    }
    return subs;
  }
  const apply = (b, subs) => { for (const [s, a] of subs) b.submit(s, a); return b.resolveTurn(); };

  // ---------- run ----------

  const report = {battles: 0, battlesByCategory: {}, constructionSkipped: [], turns: 0, turnsByCategory: {}, extraCloneTurns: 0,
    mismatches: [], errors: [], results: {}, scriptIdsUsed: 0, scriptIdsTotal: allScriptIds.size, scriptIdsUnused: [], actionKinds: {}, timing: {}};
  const scriptUses = new Map();
  const cloneTimes = [], cloneTurnTimes = [], resolveTimes = [];
  const fail = (entry) => { if (report.mismatches.length < 50) report.mismatches.push(entry); report.mismatchCount = (report.mismatchCount ?? 0) + 1; };
  const TURN_LIMIT = 120;
  const started = performance.now();

  for (const [index, item] of corpus.entries()) {
    if (index % shardCount !== shardIndex) continue;
    const rng = new Rng(item.seed), drv = new Rng(item.seed ^ 0x5eed);
    let battle;
    try {
      const spec = item.build(rng);
      const {traits: withTraits, ...first} = spec.sides[0];
      battle = createBattle({data, scripts, seed: item.seed, sides: [first, spec.sides[1]], encounter: spec.encounter, variant: spec.variant});
      if (withTraits) attachTraits(battle, rng);
      if (item.probe) for (const side of battle.sides) for (const mon of side.team) {
        mon.conditions.push({id: 'clone_fidelity_probe', def: {id: 'clone_fidelity_probe', kind: 'other', removed_on_switch: false, hooks: [{on: 'choose_action', script: 'clone_fidelity_probe'}]}, turns: Infinity, appliedTurn: 0});
      }
    } catch (error) {
      report.constructionSkipped.push({category: item.category, seed: item.seed, error: String(error.message)});
      continue;
    }
    report.battles++;
    report.battlesByCategory[item.category] = (report.battlesByCategory[item.category] ?? 0) + 1;
    const where = (extra) => ({category: item.category, seed: item.seed, turn: battle.turn, phase: battle.phase, ...extra});

    for (let step = 0; !battle.result && step < TURN_LIMIT; step++) {
      const subs = chooseSubmissions(battle, drv, {explicitTrainers: !item.probe, preferUnused: item.category === 'script-coverage'});
      for (const [, a] of subs) report.actionKinds[a.kind] = (report.actionKinds[a.kind] ?? 0) + 1;
      const beforeFp = fingerprint(battle), beforeState = stateJson(battle), beforeLog = eventsJson(battle.log), beforeLogLength = battle.log.length;

      // 1. A fresh clone equals the original and shares no mutable object.
      let t0 = performance.now();
      const clone = cloneBattle(battle);
      cloneTimes.push(performance.now() - t0);
      if (Object.getPrototypeOf(clone) !== Object.getPrototypeOf(battle) || Object.getPrototypeOf(clone.rng) !== Object.getPrototypeOf(battle.rng)) fail(where({check: 'prototype'}));
      if (fingerprint(clone) !== beforeFp) fail(where({check: 'clone-equals-original'}));
      const shared = sharedMutable(battle, clone);
      if (shared.length) fail(where({check: 'no-shared-mutable', sample: shared.slice(0, 3).map((v) => Array.isArray(v) ? `array(${v.length})` : Object.keys(v).slice(0, 6).join(','))}));

      // 2. Extra turns on another clone leave the original untouched.
      const scratch = cloneBattle(battle), extra = 1 + drv.int(0, 2);
      try {
        for (let k = 0; k < extra && !scratch.result; k++) { apply(scratch, chooseSubmissions(scratch, drv, {explicitTrainers: !item.probe})); report.extraCloneTurns++; }
      } catch (error) {
        report.errors.push(where({check: 'extra-clone-turn', error: String(error.stack).split('\n').slice(0, 3).join(' | ')}));
      }
      if (fingerprint(battle) !== beforeFp) fail(where({check: 'isolation-full-state'}));
      if (stateJson(battle) !== beforeState) fail(where({check: 'isolation-state'}));
      if (battle.log.length !== beforeLogLength || eventsJson(battle.log) !== beforeLog) fail(where({check: 'isolation-log'}));

      // 3. Timing as the planner uses a clone: copy, explicit actions for both sides, one turn.
      if (!battle.result) {
        const timingDrv = new Rng(item.seed * 977 + step);
        t0 = performance.now();
        const probe = cloneBattle(battle);
        const t1 = performance.now();
        try {
          apply(probe, chooseSubmissions(probe, timingDrv, {explicitAll: true}));
          const t2 = performance.now();
          cloneTurnTimes.push(t2 - t0); resolveTimes.push(t2 - t1);
        } catch { /* Covered by the fidelity step below. */ }
      }

      // 4. Same actions, same RNG state: identical events, state and full state.
      let origEvents, cloneEvents, origError, cloneError;
      probe.armed = !!item.probe;
      try { origEvents = apply(battle, subs); } catch (error) { origError = String(error.message); } finally { probe.armed = false; }
      try { cloneEvents = apply(clone, subs); } catch (error) { cloneError = String(error.message); }
      report.turns++;
      report.turnsByCategory[item.category] = (report.turnsByCategory[item.category] ?? 0) + 1;
      if (origError || cloneError) {
        if (origError !== cloneError) fail(where({check: 'same-error', origError, cloneError}));
        report.errors.push(where({check: 'resolve', error: origError}));
        break;
      }
      if (eventsJson(origEvents) !== eventsJson(cloneEvents)) fail(where({check: 'events', actions: subs}));
      if (stateJson(battle) !== stateJson(clone)) fail(where({check: 'state', actions: subs}));
      if (fingerprint(battle) !== fingerprint(clone)) fail(where({check: 'full-state', actions: subs}));
      for (const e of origEvents) {
        if (e.type !== 'move_used') continue;
        const owner = battle.sides[e.side].team.find((m) => m.skillOverrides?.[e.skill]);
        for (const id of scriptIdsOf(owner ? owner.skillOverrides[e.skill] : data.skills.get(e.skill))) scriptUses.set(id, (scriptUses.get(id) ?? 0) + 1);
      }
    }
    const outcome = battle.result ? `${battle.result.reason}` : 'turn_limit';
    report.results[outcome] = (report.results[outcome] ?? 0) + 1;
  }

  const stats = (xs) => {
    const s = [...xs].sort((a, b) => a - b), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return {samples: s.length, meanMs: +(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)).toFixed(4), p50Ms: +q(0.5).toFixed(4), p95Ms: +q(0.95).toFixed(4), p99Ms: +q(0.99).toFixed(4), maxMs: +s[s.length - 1].toFixed(4)};
  };
  report.timing = {cloneOnly: stats(cloneTimes), clonePlusOneTurn: stats(cloneTurnTimes), oneTurnOnClone: stats(resolveTimes)};
  report.scriptIdsUsed = [...allScriptIds].filter((id) => scriptUses.has(id)).length;
  report.scriptIdsUnused = [...allScriptIds].filter((id) => !scriptUses.has(id)).sort();
  report.nestedProbe = {runs: probe.runs, nestedTurns: probe.nestedTurns};
  report.scriptMoveUses = [...scriptUses.values()].reduce((a, b) => a + b, 0);
  report.totalSeconds = +((performance.now() - started) / 1000).toFixed(1);
  report.mismatchCount ??= 0;

  const summary = {...report, constructionSkipped: report.constructionSkipped.length, errors: report.errors.length};
  console.log(JSON.stringify(summary, null, 2));
  if (report.constructionSkipped.length) console.log('construction skipped:', JSON.stringify(report.constructionSkipped.slice(0, 10)));
  if (report.errors.length) console.log('engine errors (identical on original and clone):', JSON.stringify(report.errors.slice(0, 10)));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  if (report.mismatchCount) { console.error(`FAIL: ${report.mismatchCount} mismatches`); exitCode = 1; }
  else console.log(`PASS: ${report.battles} battles, ${report.turns} turns, ${report.extraCloneTurns} extra clone turns, 0 mismatches`);
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  globalThis.fetch = previousFetch;
  await server.close();
}
process.exit(exitCode);
