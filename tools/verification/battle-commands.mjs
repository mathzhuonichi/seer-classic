/**
 * The battle screen's commands against real controllers: the capture rule the view and the capture action share, and the
 * production playback player (battle-player.ts) on a manual clock: the command lock, the canAct guard and the capture frames.
 */
import assert from 'node:assert/strict';
import {memoryStorage, suite, withSsr} from './_harness.mjs';

memoryStorage();

/** Timers that run only when the suite advances them, in due order. */
function manualClock() {
  let now = 0, nextId = 1;
  const timers = new Map();
  const runNext = () => {
    const [id, timer] = [...timers].sort(([a, x], [b, y]) => x.at - y.at || a - b)[0];
    timers.delete(id);
    now = Math.max(now, timer.at);
    timer.run();
  };
  return {
    setTimeout: (run, ms) => { timers.set(nextId, {at: now + Math.max(0, ms), run}); return nextId++; },
    clearTimeout: id => { timers.delete(id); },
    now: () => now,
    /** Runs every pending timer, including the ones they set. */
    runAll() { while (timers.size) runNext(); },
  };
}
await withSsr('battle-commands', async load => {
  const [{createGame}, {loadCatalog}, {createBattlePlayer}, {CAPTURE_OUTCOME_MS}] = await Promise.all(['/src/kernel/game.ts',
    '/src/domain/catalog/catalog.ts', '/src/features/battle/battle-player.ts', '/src/features/battle/battle-playback.ts'].map(load));
  const catalog = await loadCatalog(), t = suite('battle-commands');
  const base = JSON.parse(createGame(catalog, '', {idle: () => {}}).exportSave());
  base.rng_state = [101, 202, 303, 404];
  /** A controller on the seeded journey that has started `start`; its turn preparation never runs. */
  const started = (start, input = catalog, save = base) => {
    const game = createGame(input, JSON.stringify(save), {idle: () => {}}), result = game.dispatch(start);
    assert(result.ok && game.snapshot().battle, `${start.type}: ${result.notice}`);
    return game;
  };

  t.check('A capture the view blocks is refused with the reason the view shows, and changes nothing', () => {
    const blocked = {
      boss: {type: 'startBattle', bossId: catalog.bosses[0].id}, trainer: {type: 'startFacility', facilityId: 'random'},
      niao: {type: 'startTraining', species: 416, level: 5},
    };
    for (const [name, start] of Object.entries(blocked)) {
      const game = started(start), view = game.snapshot().battle, save = game.exportSave();
      assert.equal(view.canCapture, false, name);
      assert.ok(view.captureBlockedReason, name);
      assert.deepEqual(game.dispatch({type: 'capture', itemId: 'item_capsule_master'}), {ok: false, notice: view.captureBlockedReason}, name);
      assert.equal(game.exportSave(), save, name);
    }
  });

  /** The battle screen over `game`: the player, what it dispatched, played and said (and when), and the screen's revision effect. */
  function screen(game) {
    const clock = manualClock(), dispatched = [], sounds = [], events = [], dialogue = [], saidAt = new Map();
    const player = createBattlePlayer({
      battle: () => game.snapshot().battle,
      dispatch: action => { dispatched.push(action); return game.dispatch(action); },
      sound: cue => sounds.push(cue),
      motion: () => ({reducedMotion: false}),
      clock,
      onStart: () => events.push('start'),
      onNeedsSwitch: battle => events.push(battle.needsSwitch ? 'needsSwitch' : 'needsSwitch without a faint'),
    });
    player.subscribe(() => {
      const line = player.state().dialogue;
      if (dialogue.at(-1) !== line) { dialogue.push(line); saidAt.set(line, clock.now()); }
    });
    let stop = player.play(game.snapshot().battle);
    /** What the screen does when the animation revision changes: cancel the old turn and play the new one. */
    const rerender = () => { stop(); stop = player.play(game.snapshot().battle); };
    return {player, clock, dispatched, sounds, events, dialogue, saidAt, rerender};
  }
  const wild = (input = catalog) => started({type: 'startTraining', species: 22, level: 3}, input);
  const failing = structuredClone(catalog);
  failing.species.find(species => species.id === 22).catch_rate = 0;

  t.check('A capsule that catches: one dispatch, the capsule frames, then a finished battle that takes no command', () => {
    const game = wild(), ui = screen(game), capture = {type: 'capture', itemId: 'item_capsule_master'};
    const foe = game.snapshot().battle.enemy.name;
    assert.ok(ui.player.canAct());
    ui.player.submit(capture);
    ui.player.submit(capture);
    assert.equal(ui.dispatched.length, 1, 'the second click before the screen re-renders is locked out');
    assert.equal(ui.player.state().busy, true);
    ui.rerender();
    ui.player.submit(capture);
    assert.equal(ui.dispatched.length, 1, 'no command while the turn plays');
    const {frames} = game.snapshot().battle.animation, capsule = frames.find(frame => frame.kind === 'capture');
    assert.equal(capsule?.captureSuccess, true);
    ui.clock.runAll();
    const state = ui.player.state(), view = game.snapshot().battle;
    assert.deepEqual([state.busy, state.frame, state.captureResolved, view.finished, view.captured], [false, null, true, true, true]);
    assert.deepEqual(ui.events, ['start']);
    assert.deepEqual(ui.sounds, ['click', 'capture']);
    const thrown = ui.saidAt.get(`正在使用无敌精灵胶囊捕捉${foe}…`), caught = ui.saidAt.get(`我方使用了无敌精灵胶囊，成功捕捉${foe}！`);
    assert.equal(caught - thrown, CAPTURE_OUTCOME_MS, 'the outcome shows once the capsule has flown');
    assert.ok(!ui.player.canAct(), 'a finished battle takes no command');
    ui.player.submit({type: 'flee'});
    assert.equal(ui.dispatched.length, 1);
    t.witness('capture dialogue', ui.dialogue);
  });

  t.check('A capsule the target breaks: its frames, then the battle goes on and takes one new command', () => {
    const game = wild(failing), ui = screen(game), capture = {type: 'capture', itemId: 'item_capsule_basic'};
    const foe = game.snapshot().battle.enemy.name;
    ui.player.submit(capture);
    ui.rerender();
    ui.clock.runAll();
    const state = ui.player.state(), view = game.snapshot().battle;
    assert.ok(view.animation.frames.some(frame => frame.kind === 'capture' && frame.captureSuccess === false));
    assert.deepEqual([state.busy, state.captureResolved, view.finished], [false, false, false]);
    assert.ok(!ui.sounds.includes('capture'));
    assert.ok(ui.dialogue.includes(`正在使用普通精灵胶囊捕捉${foe}…`));
    assert.ok(ui.dialogue.includes(`我方使用了普通精灵胶囊，${foe}挣脱了胶囊，捕捉失败。`));
    assert.ok(ui.player.canAct());
    ui.player.submit(capture);
    ui.player.submit(capture);
    assert.equal(ui.dispatched.length, 2);
    t.witness('failed capture dialogue', ui.dialogue);
  });

  t.check('A command the controller refuses shows its notice and unlocks at once', () => {
    const game = started({type: 'startBattle', bossId: catalog.bosses[0].id}), ui = screen(game);
    ui.player.submit({type: 'capture', itemId: 'item_capsule_master'});
    const state = ui.player.state();
    assert.deepEqual([state.busy, state.dialogue], [false, game.snapshot().battle.captureBlockedReason]);
    assert.ok(ui.player.canAct());
  });

  t.finish();
});
