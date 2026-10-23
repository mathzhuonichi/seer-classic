import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  HOST_FAILURES, PLAY_LATENCY_MS, RECYCLE_EFFECTS, SKILL_EFFECTS_WAIT_MS, SkillEffectSession, battleSkillIds, skillEffectTiming,
} from './skill-effect-session.ts';

const FPS = 24, FRAME_MS = 1000 / FPS, LABEL_TIMED = 303;
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} vs ${expected}`);
/** Whether `promise` settles before the next macrotask: the fakes answer in microtasks, so it did not wait for any time to pass. */
const soon = promise => Promise.race([promise.then(() => true), new Promise(resolve => setImmediate(() => resolve(false)))]);
/** Lets every pending microtask run. */
const flush = () => new Promise(resolve => setImmediate(resolve));

/** A host that loads at once (or fails the keys in `failing`, or never answers those in `hanging`), and dies when it stops answering. */
function fakeHost(failing, hanging) {
  let nextId = 1;
  const deaths = [];
  const host = {
    fps: FPS, alive: true, answering: true, suspended: false, parent: null, loads: [], plays: [], stops: [], destroyed: false,
    ping() {
      if (!host.answering) host.die('it stopped answering');
      return host.alive;
    },
    onDeath: listener => { deaths.push(listener); },
    moveTo: container => { host.parent = container; },
    suspend: () => { host.suspended = true; },
    resume: () => { host.suspended = false; },
    load(key) {
      host.loads.push(key);
      if (hanging.has(Number(key))) return new Promise(() => {});
      return failing.has(Number(key)) ? Promise.reject(new Error(`no ${key}`)) : Promise.resolve();
    },
    play(key, at, still) {
      if (!host.alive) return null;
      host.plays.push({key, still});
      return nextId++;
    },
    stop: id => { host.stops.push(id); },
    destroy() { host.alive = false; host.destroyed = true; },
    die(reason) {
      if (!host.alive) return;
      host.alive = false;
      for (const listener of deaths.splice(0)) listener(reason);
    },
  };
  return host;
}

/**
 * A session over fake hosts: `effects` rows by skill id, `failing` skill loads that fail, `hanging` ones that never answer.
 * `state.blocked` makes every start fail; `state.hang` holds every start in `state.starts` until the test settles it. Time passes
 * only in `expire()`, which ends every wait begun so far (SKILL_EFFECTS_WAIT_MS, the only one the session asks for).
 */
function harness({effects = {11006: [23, 'a', 1], 20001: [22, 'b', 1], 10022: [30, 'c', 9]}, failing = new Set(), hanging = new Set()} = {}) {
  const hosts = [], warnings = [], hiddenListeners = new Set(), park = {name: 'park'}, timers = [];
  const state = {hidden: false, blocked: false, hang: false, starts: []};
  const session = new SkillEffectSession({
    data: async () => ({path: '/fx/<skillId>.swf', effects, labelTimed: new Set([LABEL_TIMED])}),
    async start() {
      if (state.blocked) throw new Error('blocked');
      if (state.hang) return new Promise((resolve, reject) => state.starts.push({resolve, reject}));
      const host = fakeHost(failing, hanging);
      host.parent = park;
      hosts.push(host);
      return host;
    },
    park: () => park,
    url: (path, skillId, version) => `${path.replace('<skillId>', skillId)}?v=${version}`,
    hidden: () => state.hidden,
    onHidden(listener) {
      hiddenListeners.add(listener);
      return () => hiddenListeners.delete(listener);
    },
    report: what => warnings.push(what),
    wait(ms) {
      assert.equal(ms, SKILL_EFFECTS_WAIT_MS);
      return new Promise(resolve => timers.push(resolve));
    },
  });
  const hide = () => {
    state.hidden = true;
    for (const listener of hiddenListeners) listener();
  };
  const expire = () => { for (const resolve of timers.splice(0)) resolve(); };
  return {session, hosts, warnings, park, state, hide, expire};
}

const at = {x: 1, y: 2, scaleX: 1, scaleY: 1};

test('an effect is timed as the original fight module did, at the host\'s rate', () => {
  const labelled = skillEffectTiming([23, 'a', 1], FPS, true), other = skillEffectTiming([23, 'a', 1], FPS, false);
  near(labelled.startMs, -PLAY_LATENCY_MS, 'a label-timed species starts with the hit frame');
  near(other.startMs, FRAME_MS - PLAY_LATENCY_MS, 'the others one stage frame later');
  near(labelled.durationMs, 24 * FRAME_MS, 'to the frame that sets isEnd, and the frame before it starts');
  near(labelled.hurtMs, 2 * FRAME_MS, 'the target is hurt two stage frames after frame 1');
  near(other.hurtMs, 3 * FRAME_MS, 'two frames after a frame 1 that came a frame later');
  near(skillEffectTiming([30, 'c', 9], FPS, true).hurtMs, 9 * FRAME_MS, 'or on a later hit frame');
});

test('the label-timed species are the original\'s PetLabelXMLInfo list: 450 entries, 446 of them species here', () => {
  const data = new URL('../../../data/', import.meta.url), {species} = JSON.parse(fs.readFileSync(new URL('original-fight-timing.json', data), 'utf8'));
  const ours = new Set(fs.readdirSync(new URL('monsters/', data)).map(file => Number.parseInt(file, 10)));
  assert.deepEqual([species.length, new Set(species).size, species.filter(id => ours.has(id)).length], [450, 450, 446]);
  assert.deepEqual(species, [...species].sort((a, b) => a - b));
});

test('a battle loads both parties\' skills, each once, and waits for those of the two creatures that open it', () => {
  const monster = ids => ({skills: ids.map(id => ({id}))});
  assert.deepEqual(battleSkillIds({player: monster([1, 2]), enemy: monster([3]), party: [monster([1, 2]), monster([4])], enemyParty: [monster([3, 5])]}),
    {all: [1, 2, 3, 4, 5], lead: [1, 2, 3]});
});

test('one host serves every battle: started by the first loading screen, taken by each battle screen and parked between', async () => {
  const {session, hosts, park} = harness(), arena = {name: 'arena'};
  assert.equal(hosts.length, 0, 'nothing starts before a loading screen');
  await session.prepare([11006, 20001]);
  assert.deepEqual([hosts.length, hosts[0].loads, hosts[0].parent, hosts[0].suspended], [1, ['11006', '20001'], park, true]);
  for (let battle = 0; battle < 3; battle++) {
    const stage = session.stage(arena);
    assert.deepEqual([hosts[0].parent, hosts[0].suspended], [arena, false], 'in the arena from the battle screen\'s start');
    stage.dispose();
    assert.deepEqual([hosts[0].parent, hosts[0].suspended], [park, true]);
    await session.prepare([11006, 20001]);
  }
  assert.deepEqual([hosts.length, hosts[0].loads.length], [1, 2], 'loaded effects stay loaded');
});

test('effects are timed only while a battle screen holds a host that answers, the effect is in and the page shows', async () => {
  const {session, hosts, hide} = harness();
  assert.equal(session.timing(11006, LABEL_TIMED), undefined, 'no host yet');
  await session.prepare([11006]);
  assert.equal(session.timing(11006, LABEL_TIMED), undefined, 'no battle screen holds it');
  const stage = session.stage({});
  near(session.timing(11006, LABEL_TIMED).startMs, -PLAY_LATENCY_MS, 'a label-timed species');
  near(session.timing(11006, 1).startMs, FRAME_MS - PLAY_LATENCY_MS, 'another species');
  assert.equal(session.timing(20001, 1), undefined, 'not loaded yet');
  assert.ok(hosts[0].loads.includes('20001'), 'a miss loads it for its next use');
  await Promise.resolve();
  assert.ok(session.timing(20001, 1), 'its next use plays');
  assert.equal(session.timing(99999, 1), undefined, 'a skill without an effect');
  hide();
  assert.equal(session.timing(11006, 1), undefined, 'the page is hidden');
  stage.dispose();
});

test('a stage plays only loaded effects, now; one that cannot start, and one a hidden page stops, say they are missing', async () => {
  const {session, hosts, hide} = harness({failing: new Set([10022])});
  await session.prepare([11006, 10022]);
  const stage = session.stage({}), missed = [];
  stage.play(10022, at, false, () => missed.push('failed load'));
  stage.play(20001, at, false, () => missed.push('not loaded'));
  const stop = stage.play(11006, at, false, () => missed.push('stopped'));
  assert.deepEqual(hosts[0].plays, [{key: '11006', still: 0}]);
  stage.play(11006, at, true, () => missed.push('hidden'));
  assert.deepEqual(hosts[0].plays.at(-1), {key: '11006', still: 12}, 'reduced motion holds the middle frame');
  stop();
  hide();
  assert.deepEqual(missed, ['failed load', 'not loaded', 'hidden'], 'a hidden page stops what plays');
  assert.equal(hosts[0].stops.length, 2);
  stage.play(11006, at, false, () => missed.push('while hidden'));
  assert.equal(missed.at(-1), 'while hidden');
  stage.dispose();
});

test('a host that dies is dropped: plays end, timing stops, and the next loading screen starts one more', async () => {
  const {session, hosts, warnings} = harness();
  await session.prepare([11006]);
  const stage = session.stage({}), missed = [];
  stage.play(11006, at, false, () => missed.push(1));
  hosts[0].answering = false;
  assert.equal(session.timing(11006, 1), undefined, 'a host that does not answer the ping');
  assert.deepEqual([missed, warnings], [[1], ['the effect host']]);
  stage.dispose();
  await session.prepare([11006]);
  assert.equal(hosts.length, 2);
  session.stage({});
  assert.ok(session.timing(11006, 1));
  hosts[1].die('its WebGL context was lost');
  await session.prepare([11006]);
  assert.equal(hosts.length, 2, `after ${HOST_FAILURES} failures the page plays no effects`);
});

test('without Ruffle a battle has no effects, one warning, and the loading screens try again up to the limit', async () => {
  const {session, hosts, warnings, state} = harness();
  state.blocked = true;
  for (let n = 0; n < 4; n++) await session.prepare([11006]);
  session.stage({});
  assert.deepEqual([hosts.length, session.timing(11006, 1)], [0, undefined]);
  assert.deepEqual(warnings, ['Ruffle', 'Ruffle'], 'reported once per page by the boundary');
});

test(`a host that would hold more than ${RECYCLE_EFFECTS} effects is replaced by the next loading screen, never during a battle`, async () => {
  const effects = Object.fromEntries(Array.from({length: RECYCLE_EFFECTS + 20}, (_, n) => [10001 + n, [20, 'v', 1]]));
  const ids = Object.keys(effects).map(Number), {session, hosts} = harness({effects});
  await session.prepare(ids.slice(0, RECYCLE_EFFECTS));
  await session.prepare(ids.slice(0, 8));
  assert.equal(hosts.length, 1, 'a battle that needs nothing new keeps it');
  const stage = session.stage({});
  await session.prepare(ids.slice(RECYCLE_EFFECTS, RECYCLE_EFFECTS + 10));
  assert.equal(hosts.length, 1, 'a held host is never replaced');
  stage.dispose();
  await session.prepare(ids.slice(RECYCLE_EFFECTS - 4, RECYCLE_EFFECTS + 10));
  assert.equal(hosts.length, 1, 'nor one that has every effect a battle needs');
  await session.prepare(ids.slice(RECYCLE_EFFECTS, RECYCLE_EFFECTS + 20));
  assert.deepEqual([hosts.length, hosts[0].destroyed, hosts[1].loads.length], [2, true, 20], 'the new host loads only this battle\'s');
});

test('a stage disposed before the host runs takes nothing; the next one takes it once it runs', async () => {
  const {session, hosts, park} = harness();
  const preparing = session.prepare([11006]), early = session.stage({name: 'early'});
  early.dispose();
  const later = {name: 'later'}, stage = session.stage(later);
  await preparing;
  await Promise.resolve();
  assert.equal(hosts[0].parent, later);
  assert.equal(hosts[0].suspended, false, 'held by a battle screen');
  stage.dispose();
  assert.deepEqual([hosts[0].parent, hosts[0].suspended], [park, true]);
});

test('a start that never answers holds only the loading screen that began it, and no later start is waited for', async () => {
  const {session, hosts, warnings, state, expire} = harness();
  state.hang = true;
  const first = session.prepare([11006]);
  assert.equal(await soon(first), false, 'the first loading screen waits for the start');
  expire();
  await first;
  assert.deepEqual(warnings, ['this battle\'s effects'], 'and says that its battle opens without effects');
  assert.equal(await soon(session.prepare([11006])), true, 'a later one does not wait for that start again');
  state.starts[0].reject(new Error('the skill-effect host did not start in time'));
  await flush();
  assert.deepEqual(warnings.at(-1), 'Ruffle', 'the failure is reported');
  assert.equal(await soon(session.prepare([11006])), true, 'the next loading screen starts one more, without waiting for it');
  assert.equal(state.starts.length, 2);
  state.starts[1].reject(new Error('the skill-effect host did not start in time'));
  await flush();
  assert.equal(await soon(session.prepare([11006])), true);
  assert.deepEqual([state.starts.length, hosts.length], [HOST_FAILURES, 0], `after ${HOST_FAILURES} failures the page starts no host`);
});

test('a start that lands after its loading screen gave up loads that battle\'s effects, and the battle screen takes it', async () => {
  const {session, state, expire, park} = harness();
  state.hang = true;
  const preparing = session.prepare([11006]);
  expire();
  await preparing;
  const arena = {name: 'arena'}, stage = session.stage(arena), host = fakeHost(new Set(), new Set());
  state.starts[0].resolve(host);
  await flush();
  assert.deepEqual([host.parent, host.suspended, host.loads], [arena, false, ['11006']]);
  assert.ok(session.timing(11006, 1), 'its effects play from then on');
  stage.dispose();
  assert.equal(host.parent, park);
});

test('a load that never answers holds only one loading screen; the other effects play', async () => {
  const {session, hosts, warnings, expire} = harness({hanging: new Set([10022])});
  const first = session.prepare([11006, 10022]);
  assert.equal(await soon(first), false);
  expire();
  await first;
  await flush();
  assert.deepEqual([warnings, hosts[0].suspended], [['this battle\'s effects'], true], 'the host waits suspended all the same');
  assert.equal(await soon(session.prepare([11006, 10022])), true, 'a later loading screen does not wait for it again');
  session.stage({});
  assert.ok(session.timing(11006, 1));
  assert.equal(session.timing(10022, 1), undefined);
  assert.deepEqual(hosts[0].loads, ['11006', '10022'], 'asked for once');
});

test('a loading screen waits for the opening creatures\' effects only; the others load behind the battle', async () => {
  const {session, hosts, warnings} = harness({hanging: new Set([10022])});
  assert.equal(await soon(session.prepare([11006, 10022], [11006])), true);
  assert.deepEqual([hosts[0].loads, hosts[0].suspended, warnings], [['11006', '10022'], false, []], 'the host runs while they load');
  session.stage({});
  assert.ok(session.timing(11006, 1));
});

test('a stage stops every effect it plays when the arena moves, and their cues skip', async () => {
  const {session, hosts} = harness();
  await session.prepare([11006, 20001]);
  const stage = session.stage({}), missed = [];
  const stop = stage.play(11006, at, false, () => missed.push(11006));
  stage.play(20001, at, false, () => missed.push(20001));
  stage.stopAll();
  assert.deepEqual([missed, hosts[0].stops], [[11006, 20001], [1, 2]]);
  stop();
  assert.equal(hosts[0].stops.length, 2, 'a stopped effect is not stopped twice');
  stage.dispose();
});
