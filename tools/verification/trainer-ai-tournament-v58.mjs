/**
 * V58 trainer AI tournament (design note section 12.5).
 *
 * Planner A and planner B drive facility-built trainer teams against each other.
 * Every team pairing is a mirror: the same two teams, the same battle seed and the
 * same side placement, played once with A driving side 0 and B side 1, and once
 * with the planners exchanged. Team strength and side asymmetries therefore cancel
 * within a pairing, and only the planner differs between its two games.
 *
 * Usage:
 *   node tools/verification/trainer-ai-tournament-v58.mjs \
 *     [--facility random|elite|classic|all] [--games N] [--a search|v57] [--b search|v57] \
 *     [--seed S] [--max-turns T] [--out report.json] [--quiet]
 *
 * --games is the number of team pairings per facility; each pairing is two battles.
 * Results are deterministic for a given seed (decision times are not).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FACILITIES = ['random', 'elite', 'classic'];
const PLANNERS = ['search', 'v57'];

function parseArgs(argv) {
  const opts = {facility: 'all', games: 30, a: 'search', b: 'v57', seed: 1, maxTurns: 200, out: undefined, quiet: false};
  for (let k = 0; k < argv.length; k++) {
    const flag = argv[k], value = () => {
      if (k + 1 >= argv.length) throw new Error(`${flag} needs a value`);
      return argv[++k];
    };
    switch (flag) {
      case '--facility': opts.facility = value(); break;
      case '--games': opts.games = Number(value()); break;
      case '--a': opts.a = value(); break;
      case '--b': opts.b = value(); break;
      case '--seed': opts.seed = Number(value()); break;
      case '--max-turns': opts.maxTurns = Number(value()); break;
      case '--out': opts.out = value(); break;
      case '--quiet': opts.quiet = true; break;
      case '--help': case '-h':
        console.log('Usage: trainer-ai-tournament-v58.mjs [--facility random|elite|classic|all] [--games N] [--a search|v57] [--b search|v57] [--seed S] [--max-turns T] [--out report.json] [--quiet]');
        process.exit(0);
      default: throw new Error(`unknown argument ${flag}`);
    }
  }
  if (![...FACILITIES, 'all'].includes(opts.facility)) throw new Error(`--facility must be one of ${[...FACILITIES, 'all'].join('|')}`);
  for (const key of ['a', 'b']) if (!PLANNERS.includes(opts[key])) throw new Error(`--${key} must be one of ${PLANNERS.join('|')}`);
  if (!Number.isSafeInteger(opts.games) || opts.games < 1) throw new Error('--games must be a positive integer');
  if (!Number.isSafeInteger(opts.seed) || opts.seed < 0) throw new Error('--seed must be a non-negative integer');
  if (!Number.isSafeInteger(opts.maxTurns) || opts.maxTurns < 1) throw new Error('--max-turns must be a positive integer');
  opts.out = path.resolve(opts.out ?? path.join(root, 'artifacts/trainer-ai-tournament-v58', `${opts.a}-vs-${opts.b}-${opts.facility}-g${opts.games}-s${opts.seed}.json`));
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const log = (...xs) => { if (!opts.quiet) console.log(...xs); };

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

const BATTLE_FILE = path.join(root, 'battle/core/src/battle.ts');
let replacementTimingInstalled = false;
// Replacements are chosen inside resolveTurn. This in-memory transform wraps the
// engine's imported chooseAiReplacement so it can be timed; no source file changes.
const replacementTiming = {
  name: 'tournament-replacement-timing', enforce: 'pre',
  transform(code, id) {
    if (id.split('?')[0] !== BATTLE_FILE) return;
    const re = /import\s*\{([^}]*)\}\s*from\s*(['"])\.\/ai(\.ts)?\2\s*;?/;
    const match = code.match(re);
    if (!match || !/\bchooseAiReplacement\b/.test(match[1])) return;
    replacementTimingInstalled = true;
    const names = match[1].replace(/\bchooseAiReplacement\b/, 'chooseAiReplacement as __tournamentRawReplacement');
    return code.replace(re, `import {${names}} from ${match[2]}./ai${match[3] ?? ''}${match[2]};\n` +
      'const chooseAiReplacement = (battle: any, side: any) => { const hook = (globalThis as any).__seerTournamentReplacement; ' +
      'if (!hook) return __tournamentRawReplacement(battle, side); const start = performance.now(); ' +
      'try { return __tournamentRawReplacement(battle, side); } finally { hook(battle, side, performance.now() - start); } };\n');
  },
};

const wallStart = performance.now();
const server = await createServer({root, configFile: false, cacheDir: path.join(root, 'artifacts/.validation-cache/trainer-ai-tournament-v58'),
  server: {middlewareMode: true, watch: null, hmr: false, ws: false}, optimizeDeps: {noDiscovery: true, include: []}, appType: 'custom', logLevel: 'error',
  plugins: [replacementTiming]});
try {
  const [core, {SEER_SCRIPTS}, {npcTrainingScripts}, {traitScripts}, {campaignScripts}, {loadCatalog}, {createFacilityEncounter},
    {normalizeBattleSupplyItems, trainerBattleSupplies}, {normalizeNpcTrainingEncounter}, {bossEncounterForAttempt}] = await Promise.all([
    '/battle/core/src/index.ts', '/battle/core/src/scripts/index.ts', '/src/mechanics/npc-training.ts', '/src/mechanics/traits.ts',
    '/src/mechanics/campaign-rules.ts', '/src/mechanics/catalog.ts', '/src/progression/battle-facilities.ts', '/src/progression/battle-supplies.ts',
    '/src/progression/npc-training.ts', '/src/mechanics/boss-encounter.ts'].map(id => server.ssrLoadModule(id)));
  const {createBattle, buildDataSet, Rng, chooseAiAction} = core;

  // Catalog exactly as createGame prepares it for battle (src/game.ts).
  let catalog = await loadCatalog();
  catalog = {...catalog, items: normalizeBattleSupplyItems(catalog.items), bosses: structuredClone(catalog.bosses)};
  if (!catalog.items.some(item => item.id === 'item_status_cure')) catalog.items.push({id: 'item_status_cure', name: {zh: '异常解除剂'}, kind: 'battle',
    desc: {zh: '解除选中精灵的全部异常状态，不清除能力变化。'}, battle_effects: [{op: 'cure_status', target: 'self'}],
    source: 'Authored remake supply; the recovered item catalogue contains no status-cure consumables.'});
  const data = buildDataSet(catalog);
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
  const aiFor = (encounter, planner) => ({kind: 'smart', allow_switch: true, style: encounter.ai?.style ?? 'balanced', planner});

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

  let current = null;  // {battle, roles, timing}
  globalThis.__seerTournamentReplacement = (battle, side, ms) => {
    if (current && battle === current.battle) current.timing[current.roles[side.index]].replacement.push(ms);
  };

  /** One battle. planners[i] drives side i; roles[i] is 'A' or 'B'. */
  function playGame(facility, pairing, mirror, {teams, battleSeed}, roles, timing) {
    const planners = roles.map(role => role === 'A' ? opts.a : opts.b);
    const [own, foe] = teams.map(team => structuredClone(team));
    const side0 = {kind: 'trainer', name: own.name?.zh, team: own.team, rules: own.rules ?? [], ai: aiFor(own, planners[0]),
      items: {...(own.items ?? {})}, unlimited_items: trainerBattleSupplies(catalog, own)};
    const side1 = {kind: 'trainer', team: foe.team, items: {...(foe.items ?? {})}, unlimited_items: trainerBattleSupplies(catalog, foe)};
    const encounter = {...foe, ai: aiFor(foe, planners[1])};
    const record = {facility, pairing, mirror, battleSeed, roles, planners, teams: teams.map(t => t.facility === 'classic' ? t.id : t.team.map(m => m.species))};
    const notes = [];
    let battle;
    const started = performance.now();
    try {
      battle = createBattle({data, scripts, seed: battleSeed, maxTurns: opts.maxTurns, sides: [side0, side1], encounter});
      for (const index of [0, 1]) {
        const side = battle.sides[index];
        if (side.kind !== 'trainer' || side.ai?.planner !== planners[index] || side.unlimitedItems.size === 0) throw new Error(`side ${index} was not built as a supplied trainer with planner ${planners[index]}`);
        for (const mon of side.team) for (const rule of mon.rules) if (rule.rule === 'script' && rule.id in npcScripts && !mon.conditions.some(c => c.id === rule.id))
          throw new Error(`side ${index} slot ${mon.slot}: NPC training script ${rule.id} did not install`);
      }
      current = {battle, roles, timing};
      let stalled = 0;
      while (!battle.result) {
        const turn = battle.turn;
        if (battle.phase === 'choose') for (const index of [0, 1]) {
          const side = battle.sides[index], mon = battle.active(index);
          // Mirror Battle.actionFor: forced execution and choose_action hooks precede the AI.
          if (battle.forcedExecution(mon)) continue;
          let hooked;
          for (const action of battle.fire(mon, 'choose_action', {side})) if (action && battle.isLegal(index, action)) { hooked = action; break; }
          if (hooked) { side.pending = hooked; continue; }
          const start = performance.now();
          const action = chooseAiAction(battle, side);
          timing[roles[index]].action.push(performance.now() - start);
          if (!battle.isLegal(index, action) && notes.length < 20) notes.push({turn: battle.turn, side: index, illegalAction: action});
          // The engine's own AI path does not validate legality either; keep its behavior.
          side.pending = action;
        }
        battle.resolveTurn();
        stalled = battle.turn === turn && !battle.result ? stalled + 1 : 0;
        if (stalled > 4) throw new Error(`battle stalled at turn ${turn} in phase ${battle.phase}`);
      }
      const {winner, reason} = battle.result;
      const out = battle.sides.map(side => side.team.every(mon => mon.fainted));
      const draw = winner === null || (out[0] && out[1]);
      return {...record, winnerSide: draw ? null : winner, outcome: draw ? 'draw' : roles[winner], reason: draw && out[0] && out[1] ? 'both_out' : reason,
        turns: battle.turn, ms: round(performance.now() - started, 1), ...(notes.length ? {notes} : {})};
    } catch (error) {
      return {...record, outcome: 'error', turns: battle?.turn ?? null, ms: round(performance.now() - started, 1),
        error: {seed: battleSeed, turn: battle?.turn ?? null, phase: battle?.phase ?? 'construction', message: String(error?.message ?? error),
          stack: String(error?.stack ?? '').split('\n').slice(0, 6).join('\n')}};
    } finally { current = null; }
  }

  const facilities = opts.facility === 'all' ? FACILITIES : [opts.facility];
  const games = [];
  const timingByFacility = {};
  for (const facility of facilities) {
    const timing = timingByFacility[facility] = {A: {action: [], replacement: []}, B: {action: [], replacement: []}};
    for (let pairing = 0; pairing < opts.games; pairing++) {
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
      const planner = role === 'A' ? opts.a : opts.b, action = timing.flatMap(t => t[role].action), replacement = timing.flatMap(t => t[role].replacement);
      timingSummary[role] = {planner, actionMs: distribution(action), replacementMs: replacementTimingInstalled ? distribution(replacement) : null,
        allDecisionsMs: distribution([...action, ...(replacementTimingInstalled ? replacement : [])])};
    }
    return {
      games: rows.length, played: n, aWins, bWins, draws, errors: rows.length - n,
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
    config: {facility: opts.facility, pairingsPerFacility: opts.games, a: opts.a, b: opts.b, seed: opts.seed, maxTurns: opts.maxTurns},
    protocol: 'Each pairing: two facility-built teams and one battle seed; game 0 has A on side 0 and B on side 1, game 1 exchanges the planners. Teams keep their sides. Draws (turn cap, both sides out) score one half for A.',
    notes: [
      'planner is passed through AiSpec.planner; until ai.ts dispatches on it, both values run the V57 tactical planner.',
      'Action decisions are timed around chooseAiAction in the harness turn loop; replacement decisions are timed by an in-memory wrapper of the engine import of chooseAiReplacement.',
      ...(replacementTimingInstalled ? [] : ['Replacement timing was unavailable: the battle.ts import of chooseAiReplacement did not match the transform.']),
      'NPC training seal scripts install only on side index 1; the harness presents side 0 as index 1 to that guard so both sides carry their seal.',
      'The Wilson interval treats the games as independent; the two games of a pairing are correlated by design.',
    ],
    wallSeconds, overall, perFacility, games,
  };
  fs.mkdirSync(path.dirname(opts.out), {recursive: true});
  fs.writeFileSync(opts.out, JSON.stringify(report, null, 2) + '\n');

  const pct = x => x === null ? '-' : `${(x * 100).toFixed(1)}%`;
  const line = (name, s) => {
    const t = s.decisionTime;
    return `${name.padEnd(8)} games ${String(s.played).padStart(4)}  A ${String(s.aWins).padStart(3)}  B ${String(s.bWins).padStart(3)}  draw ${String(s.draws).padStart(3)}  err ${s.errors}  ` +
      `A score ${pct(s.aScoreRate)} [${pct(s.aScoreWilson95[0])}, ${pct(s.aScoreWilson95[1])}]  turns mean ${s.turns.mean} median ${s.turns.median}  ` +
      `side0/side1 ${s.sides.side0Wins}/${s.sides.side1Wins}  ` +
      ['A', 'B'].map(role => `${role}(${t[role].planner}) ms p50 ${t[role].allDecisionsMs.p50} p95 ${t[role].allDecisionsMs.p95} p99 ${t[role].allDecisionsMs.p99} max ${t[role].allDecisionsMs.max}`).join('  ');
  };
  console.log(`\nTrainer AI tournament: A=${opts.a} vs B=${opts.b}, seed ${opts.seed}, ${opts.games} pairings per facility, max ${opts.maxTurns} turns`);
  for (const facility of facilities) console.log(line(facility, perFacility[facility]));
  if (facilities.length > 1) console.log(line('overall', overall));
  for (const error of overall.engineErrors.slice(0, 10)) console.log(`ERROR ${error.facility} #${error.pairing}/${error.mirror} seed ${error.seed} turn ${error.turn}: ${error.message}`);
  console.log(`Report: ${opts.out}  (${wallSeconds}s wall)`);
} finally {
  delete globalThis.__seerTournamentReplacement;
  await server.close();
}
