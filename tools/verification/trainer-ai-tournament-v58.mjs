/**
 * V58 trainer AI tournament (design note section 12.5).
 *
 * Challenger A (the search planner) and opponent B drive facility-built trainer
 * teams against each other. Every team pairing is a mirror: the same two teams,
 * the same battle seed and the same side placement, played once with A driving
 * side 0 and B side 1, and once with the policies exchanged. Team strength and side
 * asymmetries therefore cancel within a pairing, and only the policy differs.
 *
 * Usage:
 *   node tools/verification/trainer-ai-tournament-v58.mjs \
 *     [--facility random|elite|classic|all] [--games N] [--b search|greedy] \
 *     [--seed S] [--max-turns T] [--out report.json] [--quiet] [--jobs N] [--const NAME=VALUE ...]
 *
 * B is the unmodified search planner (default) or a greedy best-damage floor.
 * --const overrides a numeric constant of the challenger's planner only (for example
 * --const ALIVE=0.5): A runs a second in-memory instance of ai.ts, search-ai.ts and
 * search/*.ts with the override, so a variant plays the default planner directly.
 * Inside planning worlds both instances share the engine's rollout replacement.
 * Source files are not changed.
 * --jobs N splits the pairings over N worker processes (pairing index modulo N)
 * and merges their games and timings into one report; results are unchanged.
 * --games is the number of team pairings per facility; each pairing is two battles.
 * Results are deterministic for a given seed (decision times are not).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import os from 'node:os';
import {createServer} from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FACILITIES = ['random', 'elite', 'classic'];
const OPPONENTS = ['search', 'greedy'];

function parseArgs(argv) {
  const opts = {facility: 'all', games: 30, b: 'search', seed: 1, maxTurns: 200, out: undefined, quiet: false, jobs: 1, shard: [0, 1], consts: {}};
  for (let k = 0; k < argv.length; k++) {
    const flag = argv[k], value = () => {
      if (k + 1 >= argv.length) throw new Error(`${flag} needs a value`);
      return argv[++k];
    };
    switch (flag) {
      case '--facility': opts.facility = value(); break;
      case '--games': opts.games = Number(value()); break;
      case '--b': opts.b = value(); break;
      case '--seed': opts.seed = Number(value()); break;
      case '--max-turns': opts.maxTurns = Number(value()); break;
      case '--out': opts.out = value(); break;
      case '--quiet': opts.quiet = true; break;
      case '--jobs': opts.jobs = Number(value()); break;
      case '--shard': opts.shard = value().split('/').map(Number); break;
      case '--const': {
        const [name, number] = value().split('=');
        if (!/^[A-Z_]+$/.test(name) || !Number.isFinite(Number(number))) throw new Error('--const needs NAME=number');
        opts.consts[name] = Number(number);
        break;
      }
      case '--help': case '-h':
        console.log('Usage: trainer-ai-tournament-v58.mjs [--facility random|elite|classic|all] [--games N] [--b search|greedy] [--seed S] [--max-turns T] [--out report.json] [--quiet] [--jobs N] [--const NAME=VALUE ...]');
        process.exit(0);
      default: throw new Error(`unknown argument ${flag}`);
    }
  }
  if (![...FACILITIES, 'all'].includes(opts.facility)) throw new Error(`--facility must be one of ${[...FACILITIES, 'all'].join('|')}`);
  if (!OPPONENTS.includes(opts.b)) throw new Error(`--b must be one of ${OPPONENTS.join('|')}`);
  if (!Number.isSafeInteger(opts.games) || opts.games < 1) throw new Error('--games must be a positive integer');
  if (!Number.isSafeInteger(opts.seed) || opts.seed < 0) throw new Error('--seed must be a non-negative integer');
  if (!Number.isSafeInteger(opts.jobs) || opts.jobs < 1 || opts.jobs > os.availableParallelism() * 2) throw new Error('--jobs must be a positive integer');
  const [k, n] = opts.shard;
  if (!Number.isSafeInteger(n) || n < 1 || !Number.isSafeInteger(k) || k < 0 || k >= n) throw new Error('--shard must be k/n with 0 <= k < n');
  if (!Number.isSafeInteger(opts.maxTurns) || opts.maxTurns < 1) throw new Error('--max-turns must be a positive integer');
  const tag = Object.entries(opts.consts).map(([name, number]) => `-${name}${number}`).join('');
  opts.out = path.resolve(opts.out ?? path.join(root, 'artifacts/trainer-ai-tournament-v58', `search${tag}-vs-${opts.b}-${opts.facility}-g${opts.games}-s${opts.seed}.json`));
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const log = (...xs) => { if (!opts.quiet) console.log(...xs); };
const sharded = opts.shard[1] > 1;

/** Runs the shards as child processes and returns their partial reports. */
async function runShards() {
  const argv = process.argv.slice(2), keep = [];
  for (let k = 0; k < argv.length; k++) {
    if (['--jobs', '--out', '--shard'].includes(argv[k])) { k++; continue; }
    if (argv[k] !== '--quiet') keep.push(argv[k]);
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trainer-ai-tournament-'));
  const script = fileURLToPath(import.meta.url);
  const parts = await Promise.all(Array.from({length: opts.jobs}, (_, k) => new Promise((resolve, reject) => {
    const out = path.join(dir, `shard-${k}.json`);
    const child = spawn(process.execPath, [script, ...keep, '--shard', `${k}/${opts.jobs}`, '--out', out, '--quiet'], {stdio: ['ignore', 'ignore', 'inherit']});
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(JSON.parse(fs.readFileSync(out, 'utf8'))) : reject(new Error(`shard ${k}/${opts.jobs} exited with ${code}`)));
  })));
  fs.rmSync(dir, {recursive: true, force: true});
  return parts;
}

// ---------- statistics ----------

function wilson(score, n, z = 1.96) {
  if (n === 0) return [0, 1];
  const p = score / n, z2 = z * z, denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n)) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
const percentile = (sorted, q) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] : null;
const round = (x, d = 3) => x === null || x === undefined ? x : Math.round(x * 10 ** d) / 10 ** d;
function distribution(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const n = sorted.length;
  return {n, mean: n ? round(sorted.reduce((s, x) => s + x, 0) / n) : null, p50: round(percentile(sorted, 0.5)), p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)), max: round(n ? sorted[n - 1] : null)};
}
const median = values => {
  const sorted = [...values].sort((x, y) => x - y), n = sorted.length;
  return n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
};
/** Deterministic 32-bit seed for (tournament seed, facility, pairing). */
function pairSeed(seed, facilityIndex, pairing) {
  let h = Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(facilityIndex + 1, 0x85ebca6b) ^ Math.imul(pairing + 1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  return (h ^ (h >>> 15)) >>> 0;
}

// ---------- engine ----------

// The challenger's planner modules, loaded a second time under `?variant` with constant overrides.
const VARIANT = '?variant=challenger';
const AI_DIR = path.join(root, 'battle/core/src');
const isPlannerFile = file => [path.join(AI_DIR, 'ai.ts'), path.join(AI_DIR, 'search-ai.ts')].includes(file) || file.startsWith(path.join(AI_DIR, 'search') + path.sep);
const appliedConstants = new Set();
const variantPlanner = {
  name: 'tournament-variant-planner', enforce: 'pre',
  transform(code, id) {
    const [file, query] = id.split('?');
    if (`?${query}` !== VARIANT || !isPlannerFile(file)) return;
    code = code.replace(/from (['"])(\.\.?\/[^'"]+)\1/g, (whole, quote, spec) =>
      isPlannerFile(path.resolve(path.dirname(file), spec)) ? `from ${quote}${spec}${VARIANT}${quote}` : whole);
    for (const [name, number] of Object.entries(opts.consts)) {
      const re = new RegExp(`\\b${name} = [-0-9.]+`);
      if (re.test(code)) { code = code.replace(re, `${name} = ${number}`); appliedConstants.add(name); }
    }
    return code;
  },
};

const wallStart = performance.now();
const server = await createServer({root, configFile: false, cacheDir: path.join(root, 'artifacts/.validation-cache/trainer-ai-tournament-v58'),
  server: {middlewareMode: true, watch: null, hmr: false, ws: false}, optimizeDeps: {noDiscovery: true, include: []}, appType: 'custom', logLevel: 'error',
  plugins: [variantPlanner]});
try {
  const [core, {SEER_SCRIPTS}, {npcTrainingScripts}, {traitScripts}, {campaignScripts}, {loadCatalog}, {createFacilityEncounter},
    {normalizeBattleSupplyItems, trainerBattleSupplies}, {normalizeNpcTrainingEncounter}, {bossEncounterForAttempt}, {conventionalMovesResolver}] = await Promise.all([
    '/battle/core/src/index.ts', '/battle/core/src/scripts/index.ts', '/src/mechanics/npc-training.ts', '/src/mechanics/traits.ts',
    '/src/mechanics/campaign-rules.ts', '/src/mechanics/catalog.ts', '/src/progression/battle-facilities.ts', '/src/progression/battle-supplies.ts',
    '/src/progression/npc-training.ts', '/src/mechanics/boss-encounter.ts', '/src/progression/conventional-moves.ts'].map(id => server.ssrLoadModule(id)));
  const {createBattle, buildDataSet, Rng} = core;
  const {chooseAiAction, chooseAiReplacement} = await server.ssrLoadModule('/battle/core/src/ai.ts');
  const variant = Object.keys(opts.consts).length ? await server.ssrLoadModule(`/battle/core/src/ai.ts${VARIANT}`) : null;
  for (const name of Object.keys(opts.consts)) if (!appliedConstants.has(name)) throw new Error(`no planner module declares a numeric constant ${name}`);
  const challenger = variant ?? {chooseAiAction, chooseAiReplacement};

  /** The floor: the best expected damage among legal moves; never switches or uses items. */
  function greedyAction(battle, side) {
    const user = battle.active(side.index), target = battle.active(1 - side.index);
    const moves = battle.legalActions(side.index).filter(action => action.kind === 'move');
    if (!moves.length) return battle.legalActions(side.index)[0];
    if (moves.some(action => action.skill === user.vol.forcedSkill)) return {kind: 'move', skill: user.vol.forcedSkill};
    const value = action => {
      const skill = battle.skill(action.skill, user);
      return skill.category === 'status' ? 0 : battle.estimateDamage(user, target, skill) * (skill.accuracy ?? 100) / 100;
    };
    return moves.reduce((best, action) => value(action) > value(best) ? action : best);
  }
  const policies = {
    A: {action: challenger.chooseAiAction, replacement: (battle, side) => challenger.chooseAiReplacement(battle, side)},
    B: opts.b === 'greedy' ? {action: greedyAction, replacement: () => undefined} : {action: chooseAiAction, replacement: chooseAiReplacement},
  };
  const policyName = role => role === 'A' ? `search${variant ? '*' : ''}` : opts.b;

  // Catalog exactly as createGame prepares it for battle (src/game.ts).
  let catalog = await loadCatalog();
  catalog = {...catalog, items: normalizeBattleSupplyItems(catalog.items), bosses: structuredClone(catalog.bosses)};
  if (!catalog.items.some(item => item.id === 'item_status_cure')) catalog.items.push({id: 'item_status_cure', name: {zh: '异常解除剂'}, kind: 'battle',
    desc: {zh: '解除选中精灵的全部异常状态，不清除能力变化。'}, battle_effects: [{op: 'cure_status', target: 'self'}],
    source: 'Authored remake supply; the recovered item catalogue contains no status-cure consumables.'});
  const data = buildDataSet(catalog);
  const conventionalMoves = conventionalMovesResolver(catalog);
  const classicTeams = [...(catalog.trainers ?? [])].sort((x, y) => String(x.id).localeCompare(String(y.id)));

  // NPC training seals guard on `side.index === 1`, so a trainer on side 0 would lose
  // its seal. Present side 0 as index 1 to that guard only, so both sides get the
  // same team the game builds for an opponent.
  const npcScripts = Object.fromEntries(Object.entries(npcTrainingScripts).map(([id, entry]) => [id, !entry.install ? entry : {...entry,
    install: (c, params) => entry.install(c.side.index === 0 && c.side.kind === 'trainer'
      ? {...c, side: new Proxy(c.side, {get: (target, key) => key === 'index' ? 1 : Reflect.get(target, key)})} : c, params)}]));
  const scripts = {...SEER_SCRIPTS, ...traitScripts, ...campaignScripts, ...npcScripts};

  /** The encounter the game's start() would battle, from the real facility constructor. */
  function facilityEncounter(facility, rng, teamId) {
    const encounter = createFacilityEncounter(catalog, facility, rng, teamId);
    // start(): attempt scaling (facility encounters never count attempts) and normalization.
    return normalizeNpcTrainingEncounter(catalog, bossEncounterForAttempt(encounter, 0));
  }
  const aiFor = encounter => ({kind: 'smart', allow_switch: true, style: encounter.ai?.style ?? 'balanced'});

  function buildPairing(facility, pairing) {
    const rng = new Rng(pairSeed(opts.seed, FACILITIES.indexOf(facility), pairing));
    let teams;
    if (facility === 'classic') {
      if (classicTeams.length < 2) throw new Error('classic facility needs at least two fixed teams');
      const first = rng.int(0, classicTeams.length - 1);
      let second = rng.int(0, classicTeams.length - 2);
      if (second >= first) second++;
      teams = [facilityEncounter('classic', rng, classicTeams[first].id), facilityEncounter('classic', rng, classicTeams[second].id)];
    } else teams = [facilityEncounter(facility, rng), facilityEncounter(facility, rng)];
    return {teams, battleSeed: rng.nextU32()};
  }

  let current = null;  // {battle, roles, timing, choices, lastSwitch, notes}
  /**
   * The battle policy of every tournament game: the live battle's decisions go to
   * the role driving each side, timed. Planning worlds are clones that share this
   * policy; their decisions stay with the default AI (rollout replacements).
   */
  const policy = {
    chooseAction(battle, side) {
      if (!current || battle !== current.battle) return chooseAiAction(battle, side);
      const role = current.roles[side.index], start = performance.now();
      const action = policies[role].action(battle, side);
      current.timing[role].action.push(performance.now() - start);
      noteChoice(current, side.index, role, action);
      return action;
    },
    chooseReplacement(battle, side) {
      if (!current || battle !== current.battle) return chooseAiReplacement(battle, side);
      const role = current.roles[side.index], start = performance.now();
      try { return policies[role].replacement(battle, side); } finally { current.timing[role].replacement.push(performance.now() - start); }
    },
  };
  function noteChoice(game, index, role, action) {
    const choice = game.choices[role], battle = game.battle;
    choice.decisions++;
    if (action.kind === 'switch') {
      choice.switches++;
      // A switch within two turns of the previous one by the same side (the V47 two-active-turn gate).
      if (battle.turn + 1 - game.lastSwitch[index] < 3) choice.quickSwitches++;
      game.lastSwitch[index] = battle.turn + 1;
    }
    // The engine does not validate the policy's action either; keep its behavior.
    if (!battle.isLegal(index, action) && game.notes.length < 20) game.notes.push({turn: battle.turn, side: index, illegalAction: action});
  }

  /** One battle. roles[i] ('A' or 'B') drives side i. */
  function playGame(facility, pairing, mirror, {teams, battleSeed}, roles, timing) {
    const planners = roles.map(policyName);
    const [own, foe] = teams.map(team => structuredClone(team));
    const side0 = {kind: 'trainer', name: own.name?.zh, team: own.team, rules: own.rules ?? [], ai: aiFor(own),
      items: {...(own.items ?? {})}, unlimited_items: trainerBattleSupplies(catalog, own)};
    const side1 = {kind: 'trainer', team: foe.team, items: {...(foe.items ?? {})}, unlimited_items: trainerBattleSupplies(catalog, foe)};
    const encounter = {...foe, ai: aiFor(foe)};
    const record = {facility, pairing, mirror, battleSeed, roles, planners, teams: teams.map(t => t.facility === 'classic' ? t.id : t.team.map(m => m.species))};
    const notes = [];
    const choices = {A: {decisions: 0, switches: 0, quickSwitches: 0}, B: {decisions: 0, switches: 0, quickSwitches: 0}}, lastSwitch = [-9, -9];
    let battle;
    const started = performance.now();
    try {
      battle = createBattle({data, scripts, seed: battleSeed, maxTurns: opts.maxTurns, conventionalMoves, sides: [side0, side1], encounter, policy});
      for (const index of [0, 1]) {
        const side = battle.sides[index];
        if (side.kind !== 'trainer' || side.ai?.kind !== 'smart' || side.unlimitedItems.size === 0) throw new Error(`side ${index} was not built as a supplied smart trainer`);
        for (const mon of side.team) for (const rule of mon.rules) if (rule.rule === 'script' && rule.id in npcScripts && !mon.conditions.some(c => c.id === rule.id))
          throw new Error(`side ${index} slot ${mon.slot}: NPC training script ${rule.id} did not install`);
      }
      current = {battle, roles, timing, choices, lastSwitch, notes};
      let stalled = 0;
      while (!battle.result) {
        const turn = battle.turn;
        battle.resolveTurn();
        stalled = battle.turn === turn && !battle.result ? stalled + 1 : 0;
        if (stalled > 4) throw new Error(`battle stalled at turn ${turn} in phase ${battle.phase}`);
      }
      const {winner, reason} = battle.result;
      const out = battle.sides.map(side => side.team.every(mon => mon.fainted));
      const draw = winner === null || (out[0] && out[1]);
      return {...record, winnerSide: draw ? null : winner, outcome: draw ? 'draw' : roles[winner], reason: draw && out[0] && out[1] ? 'both_out' : reason,
        turns: battle.turn, ms: round(performance.now() - started, 1), choices, ...(notes.length ? {notes} : {})};
    } catch (error) {
      return {...record, outcome: 'error', turns: battle?.turn ?? null, ms: round(performance.now() - started, 1),
        error: {seed: battleSeed, turn: battle?.turn ?? null, phase: battle?.phase ?? 'construction', message: String(error?.message ?? error),
          stack: String(error?.stack ?? '').split('\n').slice(0, 6).join('\n')}};
    } finally { current = null; }
  }

  const facilities = opts.facility === 'all' ? FACILITIES : [opts.facility];
  let games = [];
  const timingByFacility = {};
  for (const facility of facilities) timingByFacility[facility] = {A: {action: [], replacement: []}, B: {action: [], replacement: []}};
  if (opts.jobs > 1) {
    const parts = await runShards();
    games = parts.flatMap(part => part.games).sort((x, y) => facilities.indexOf(x.facility) - facilities.indexOf(y.facility) || x.pairing - y.pairing || x.mirror - y.mirror);
    for (const part of parts) for (const facility of facilities) for (const role of ['A', 'B']) for (const kind of ['action', 'replacement'])
      timingByFacility[facility][role][kind].push(...part.rawTiming[facility][role][kind]);
  } else for (const facility of facilities) {
    const timing = timingByFacility[facility];
    for (let pairing = 0; pairing < opts.games; pairing++) {
      if (pairing % opts.shard[1] !== opts.shard[0]) continue;
      let setup;
      try { setup = buildPairing(facility, pairing); } catch (error) {
        games.push({facility, pairing, mirror: 0, outcome: 'error', error: {seed: pairSeed(opts.seed, FACILITIES.indexOf(facility), pairing), turn: null, phase: 'team construction', message: String(error?.message ?? error)}});
        continue;
      }
      const first = playGame(facility, pairing, 0, setup, ['A', 'B'], timing);
      const second = playGame(facility, pairing, 1, setup, ['B', 'A'], timing);
      games.push(first, second);
      log(`${facility} #${pairing} seed ${setup.battleSeed}: A@0 -> ${first.outcome} (${first.turns}t, ${first.reason ?? first.error?.message})  A@1 -> ${second.outcome} (${second.turns}t, ${second.reason ?? second.error?.message})`);
    }
  }

  function summarize(rows, timing) {
    const played = rows.filter(row => row.outcome !== 'error');
    const count = outcome => played.filter(row => row.outcome === outcome).length;
    const aWins = count('A'), bWins = count('B'), draws = count('draw'), n = played.length;
    const score = aWins + draws / 2;
    const [lo, hi] = wilson(score, n);
    const reasons = {};
    for (const row of played) reasons[row.reason] = (reasons[row.reason] ?? 0) + 1;
    // Pairings whose two games share a winning side are decided by teams, not planners.
    const byPair = new Map();
    for (const row of rows) byPair.set(`${row.facility}:${row.pairing}`, [...(byPair.get(`${row.facility}:${row.pairing}`) ?? []), row]);
    let complete = 0, split = 0, sameSideWins = 0, identical = 0;
    for (const pair of byPair.values()) {
      if (pair.length !== 2 || pair.some(row => row.outcome === 'error')) continue;
      complete++;
      if (pair[0].outcome !== 'draw' && pair[1].outcome !== 'draw' && pair[0].outcome !== pair[1].outcome) split++;
      if (pair[0].winnerSide !== null && pair[0].winnerSide === pair[1].winnerSide) sameSideWins++;
      if (pair[0].winnerSide === pair[1].winnerSide && pair[0].turns === pair[1].turns && pair[0].reason === pair[1].reason) identical++;
    }
    const timingSummary = {};
    for (const role of ['A', 'B']) {
      const planner = policyName(role), action = timing.flatMap(t => t[role].action), replacement = timing.flatMap(t => t[role].replacement);
      timingSummary[role] = {planner, actionMs: distribution(action), replacementMs: distribution(replacement),
        allDecisionsMs: distribution([...action, ...replacement])};
    }
    const switching = Object.fromEntries(['A', 'B'].map(role => {
      const total = key => played.reduce((sum, row) => sum + (row.choices?.[role][key] ?? 0), 0);
      const decisions = total('decisions');
      return [role, {decisions, switches: total('switches'), quickSwitches: total('quickSwitches'), switchRate: decisions ? round(total('switches') / decisions, 4) : null}];
    }));
    return {
      games: rows.length, played: n, switching, aWins, bWins, draws, errors: rows.length - n,
      aScoreRate: n ? round(score / n, 4) : null, aScoreWilson95: [round(lo, 4), round(hi, 4)],
      turns: {mean: n ? round(played.reduce((s, row) => s + row.turns, 0) / n, 2) : null, median: median(played.map(row => row.turns))},
      sides: {side0Wins: played.filter(row => row.winnerSide === 0).length, side1Wins: played.filter(row => row.winnerSide === 1).length, draws},
      mirrors: {complete, plannerSplit: split, sameSideWon: sameSideWins, identicalBySide: identical},
      reasons, decisionTime: timingSummary,
      engineErrors: rows.filter(row => row.outcome === 'error').map(row => ({facility: row.facility, pairing: row.pairing, mirror: row.mirror, ...row.error})),
    };
  }

  const perFacility = Object.fromEntries(facilities.map(facility => [facility, summarize(games.filter(row => row.facility === facility), [timingByFacility[facility]])]));
  const overall = summarize(games, Object.values(timingByFacility));
  const wallSeconds = round((performance.now() - wallStart) / 1000, 1);
  const report = {
    tool: 'trainer-ai-tournament-v58', generatedAt: new Date().toISOString(),
    config: {facility: opts.facility, pairingsPerFacility: opts.games, a: policyName('A'), b: opts.b, seed: opts.seed, maxTurns: opts.maxTurns, jobs: opts.jobs, searchConstants: opts.consts},
    protocol: 'Each pairing: two facility-built teams and one battle seed; game 0 has A on side 0 and B on side 1, game 1 exchanges the planners. Teams keep their sides. Draws (turn cap, both sides out) score one half for A.',
    notes: [
      'A is the search planner, with the --const overrides in a separate module instance when given. B is the default search planner or the greedy floor.',
      'Every decision of the live battle is routed to the policy of its side and timed by the battle policy the harness injects.',
      'NPC training seal scripts install only on side index 1; the harness presents side 0 as index 1 to that guard so both sides carry their seal.',
      'The Wilson interval treats the games as independent; the two games of a pairing are correlated by design.',
    ],
    wallSeconds, overall, perFacility, games,
    ...(sharded ? {shard: opts.shard.join('/'), rawTiming: timingByFacility} : {}),
  };
  fs.mkdirSync(path.dirname(opts.out), {recursive: true});
  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');

  const pct = x => x === null ? '-' : `${(x * 100).toFixed(1)}%`;
  const line = (name, s) => {
    const t = s.decisionTime;
    return `${name.padEnd(8)} games ${String(s.played).padStart(4)}  A ${String(s.aWins).padStart(3)}  B ${String(s.bWins).padStart(3)}  draw ${String(s.draws).padStart(3)}  err ${s.errors}  ` +
      `A score ${pct(s.aScoreRate)} [${pct(s.aScoreWilson95[0])}, ${pct(s.aScoreWilson95[1])}]  turns mean ${s.turns.mean} median ${s.turns.median}  ` +
      `side0/side1 ${s.sides.side0Wins}/${s.sides.side1Wins}  switch A ${pct(s.switching.A.switchRate)} (${s.switching.A.quickSwitches} quick) B ${pct(s.switching.B.switchRate)} (${s.switching.B.quickSwitches} quick)  ` +
      ['A', 'B'].map(role => `${role}(${t[role].planner}) ms p50 ${t[role].allDecisionsMs.p50} p95 ${t[role].allDecisionsMs.p95} p99 ${t[role].allDecisionsMs.p99} max ${t[role].allDecisionsMs.max}`).join('  ');
  };
  console.log(`\nTrainer AI tournament: A=${policyName('A')} ${JSON.stringify(opts.consts)} vs B=${opts.b}, seed ${opts.seed}, ${opts.games} pairings per facility, max ${opts.maxTurns} turns`);
  for (const facility of facilities) console.log(line(facility, perFacility[facility]));
  if (facilities.length > 1) console.log(line('overall', overall));
  for (const error of overall.engineErrors.slice(0, 10)) console.log(`ERROR ${error.facility} #${error.pairing}/${error.mirror} seed ${error.seed} turn ${error.turn}: ${error.message}`);
  console.log(`Report: ${opts.out}  (${wallSeconds}s wall)`);
} finally {
  await server.close();
}
