/**
 * The battle screen's commands against real controllers: the capture rule the view and the capture action share, and the
 * production playback player (battle-player.ts) on a manual clock: the command lock, the canAct guard, the capture frames, the
 * forced replacement, the lines a capture and a wild victory say, each once, each outcome named once by the last dialogue line (the
 * closing notice), and the hold on turn preparation while a turn plays.
 */
import assert from 'node:assert/strict';
import {levelledGames} from './_game-battle.mjs';
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
    /** Runs the next due timer. */
    step: () => runNext(),
    /** Runs every pending timer, including the ones they set. */
    runAll() { while (timers.size) runNext(); },
  };
}
await withSsr('battle-commands', async load => {
  const [{createGame}, {loadCatalog}, {createBattlePlayer}, {CAPTURE_OUTCOME_MS}, {battleResultTitle}, {VICTORY_REWARDS}, idleSlots, {MAX_TURNS}] =
    await Promise.all([
      '/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/features/battle/battle-player.ts', '/src/features/battle/battle-playback.ts',
      '/src/features/battle/battle-hud.ts', '/src/domain/economy.ts', '/src/shared/idle.ts', '/battle/core/src/constants.ts'].map(load));
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

  /**
   * The battle screen over `game`: the player, what it dispatched, played and said (and when), how many idle holds it keeps, and the
   * screen's revision effect. `holdIdle` is the browser's hold when given, else one that only counts.
   */
  function screen(game, {holdIdle} = {}) {
    const clock = manualClock(), dispatched = [], sounds = [], events = [], dialogue = [], saidAt = new Map(), idle = {holds: 0};
    const countingHold = () => {
      let held = true;
      idle.holds++;
      return () => { if (held) idle.holds--; held = false; };
    };
    const player = createBattlePlayer({
      battle: () => game.snapshot().battle,
      dispatch: action => { dispatched.push(action); return game.dispatch(action); },
      sound: cue => sounds.push(cue),
      motion: () => ({reducedMotion: false}),
      clock,
      onStart: () => events.push('start'),
      onNeedsSwitch: battle => events.push(battle.needsSwitch ? 'needsSwitch' : 'needsSwitch without a faint'),
      onReplaced: () => events.push('replaced'),
      holdIdle: holdIdle ?? countingHold,
    });
    player.subscribe(() => {
      const line = player.state().dialogue;
      if (dialogue.at(-1) !== line) { dialogue.push(line); saidAt.set(line, clock.now()); }
    });
    let stop = player.play(game.snapshot().battle);
    /** What the screen does when the animation revision changes: cancel the old turn and play the new one. */
    const rerender = () => { stop(); stop = player.play(game.snapshot().battle); };
    return {player, clock, dispatched, sounds, events, dialogue, saidAt, idle, rerender};
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
    assert.deepEqual([ui.player.state().busy, ui.idle.holds], [true, 1]);
    ui.rerender();
    ui.player.submit(capture);
    assert.equal(ui.dispatched.length, 1, 'no command while the turn plays');
    const {frames} = game.snapshot().battle.animation, capsule = frames.find(frame => frame.kind === 'capture');
    assert.equal(capsule?.captureSuccess, true);
    ui.clock.runAll();
    const state = ui.player.state(), view = game.snapshot().battle;
    assert.deepEqual([state.busy, state.frame, state.captureResolved, view.finished, view.captured], [false, null, true, true, true]);
    assert.equal(ui.idle.holds, 0, 'the settle lets idle work go');
    assert.deepEqual(ui.events, ['start']);
    assert.deepEqual(ui.sounds, ['click', 'capture']);
    const thrown = ui.saidAt.get(`正在使用无敌精灵胶囊捕捉${foe}…`), caught = ui.saidAt.get(`我方使用了无敌精灵胶囊，成功捕捉${foe}！`);
    assert.equal(caught - thrown, CAPTURE_OUTCOME_MS, 'the outcome shows once the capsule has flown');
    assert.deepEqual(ui.dialogue, [`对手派出了${foe}。`, '第 1 回合', `正在使用无敌精灵胶囊捕捉${foe}…`, `我方使用了无敌精灵胶囊，成功捕捉${foe}！`,
      `${foe}已加入背包。`], 'each line once: the capsule, its outcome, where the catch went');
    assert.equal(view.result, ui.dialogue.at(-1));
    assert.equal(battleResultTitle(view), '捕捉成功！');
    assert.equal(view.log.at(-1), `我方使用了无敌精灵胶囊，成功捕捉${foe}！`, 'the log ends on the capsule line');
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
    assert.deepEqual([state.busy, state.dialogue, ui.idle.holds], [false, game.snapshot().battle.captureBlockedReason, 0]);
    assert.ok(ui.player.canAct());
  });

  /** The strongest skill the player's active monster still has PP for. */
  const strongest = battle => battle.player.skills.filter(skill => skill.pp > 0).sort((a, b) => (b.power || 0) - (a.power || 0))[0];
  /** Plays `game` on `ui` with `action` (by default the strongest skill) until it ends or `turns` pass; returns the view. */
  const playOut = (game, ui, {action, turns = 10} = {}) => {
    for (let turn = 0; turn < turns && !game.snapshot().battle.finished; turn++) {
      ui.player.submit(action ?? {type: 'move', skillId: strongest(game.snapshot().battle).id});
      ui.rerender();
      ui.clock.runAll();
    }
    return game.snapshot().battle;
  };
  /** A controller on the seeded journey with its lead at Lv 100, that has started `start`. */
  const levelledLead = (start, input = catalog) => {
    const game = createGame(input, JSON.stringify(base), {idle: () => {}});
    game.dispatch({type: 'cheatMonster', uid: game.snapshot().party[0], level: 100});
    assert.ok(game.dispatch(start).ok && game.snapshot().battle, start.type);
    return game;
  };

  const isTurnHeader = line => /^第 \d+ 回合$/.test(line);
  /** The dialogue since the last turn header. */
  const lastTurn = ui => ui.dialogue.slice(ui.dialogue.findLastIndex(isTurnHeader));
  /** Words that name a battle's outcome. The player's own flee line is the retreat itself, not a line about it. */
  const NAMES_OUTCOME = /胜利|成功|失败|平局|撤离/, FLEE_LINE = '我方撤离了战斗。';
  const outcomeLines = ui => lastTurn(ui).filter(line => NAMES_OUTCOME.test(line) && line !== FLEE_LINE);

  t.check('A wild victory says it once and names what it paid', () => {
    const game = levelledLead({type: 'startTraining', species: 22, level: 3}), ui = screen(game);
    const foe = game.snapshot().battle.enemy.name, {coins, exp} = VICTORY_REWARDS.wild;
    const view = playOut(game, ui, {turns: 5}), reward = `获得 ${coins} 赛尔豆及 ${exp} 积累经验。`;
    assert.ok(view.won, 'the levelled lead wins');
    assert.deepEqual(ui.dialogue.slice(-3), [`${foe}失去战斗能力。`, '战斗胜利！', reward]);
    assert.equal(view.result, reward);
    assert.deepEqual(outcomeLines(ui), ['战斗胜利！'], 'the end line alone names the win; the result text names the reward');
    assert.equal(new Set(ui.dialogue).size, ui.dialogue.length, 'no line twice');
    t.witness('wild victory dialogue', ui.dialogue);
  });

  /** The seeded journey with a party of one lead on 1 HP. */
  const lastStand = () => {
    const save = structuredClone(base);
    save.party = save.party.slice(0, 1);
    save.storage.find(mon => mon.uid === save.party[0]).hp = 1;
    return save;
  };
  /** Every skill a self-targeted PP restore: neither side can hurt the other, so a battle runs to the turn cap. */
  const stalled = {...catalog, skills: catalog.skills.map(skill => ({
    ...skill, category: 'status', target: 'self', power: 0, accuracy: null, priority: 0, effects: [{op: 'restore_pp', target: 'self', amount: 'all'}],
  }))};
  /** A trainer, whose win pays no reward item and so says the challenge's own text, with its team at Lv 1 for the Lv 100 lead. */
  const PLAIN_TRAINER = 'trainer_attrition';
  const plain = {...catalog, trainers: catalog.trainers.map(trainer => trainer.id !== PLAIN_TRAINER ? trainer
    : {...trainer, team: trainer.team.map(mon => ({...mon, level: 1}))})};

  t.check('Each outcome is named once, by the last dialogue line, which the scene repeats once the battle closes; wild and challenge wording', () => {
    const lost = start => started(start, catalog, lastStand());
    // [game, its title, the last two dialogue lines (how it ended, then the result text), play options]
    const outcomes = {
      'wild retreat': [wild(), '已撤离战斗', [FLEE_LINE, '本次撤离不发放战斗奖励。'], {action: {type: 'flee'}}],
      'wild loss': [lost({type: 'startTraining', species: 22, level: 100}), '战斗失败', ['战斗结束。', '战斗失败，可恢复精灵后继续探索。']],
      'wild draw': [wild(stalled), '本场平局', [`已达到 ${MAX_TURNS} 回合上限。`, '本场平局，可恢复精灵后继续探索。'], {turns: MAX_TURNS}],
      'challenge loss': [lost({type: 'startBattle', bossId: catalog.bosses[0].id}), '挑战失败', ['战斗结束。', '挑战失败，可恢复后再次挑战。']],
      'challenge win': [levelledLead({type: 'startBattle', bossId: PLAIN_TRAINER}, plain), '战斗胜利！', ['战斗结束。', '挑战成功，奖励已入账。']],
    };
    const said = {};
    for (const [name, [game, title, ending, options]] of Object.entries(outcomes)) {
      const ui = screen(game), view = playOut(game, ui, options), turn = lastTurn(ui);
      assert.deepEqual([view.finished, view.challenge, battleResultTitle(view)], [true, name.startsWith('challenge'), title], name);
      assert.deepEqual(ui.dialogue.slice(-2), ending, `${name}: how it ended, then the outcome`);
      // App.tsx shows the result text as the scene's notice when the battle closes.
      assert.equal(view.result, ending[1], `${name}: the closing notice`);
      assert.deepEqual(outcomeLines(ui), [view.result], `${name}: the result text alone names the outcome in the last turn`);
      assert.equal(new Set(turn).size, turn.length, `${name}: no line twice in the last turn`);
      said[name] = ending;
    }
    const retreat = outcomes['wild retreat'][0].snapshot().battle;
    assert.deepEqual([retreat.log[0], retreat.log.at(-1)], [`遭遇野生的${retreat.enemy.name}。`, '我方撤离了战斗。'], 'a wild battle opens as an encounter');
    const challenge = outcomes['challenge loss'][0].snapshot().battle;
    assert.equal(challenge.log[0], `挑战${challenge.name}。`, 'a challenge opens as one');
    t.witness('outcome endings', said);
  });

  t.check('A field recruit, whose name already says 野外挑战, opens with its name alone', () => {
    const game = createGame(catalog, JSON.stringify(base), {idle: () => {}});
    // The first catalog species met as a recruit; the contacts before it open a wild battle or a Boss, which the player leaves.
    const recruit = catalog.species.find(({id}) => {
      if (!game.dispatch({type: 'startTraining', species: id, level: 5}).ok || !game.snapshot().battle) return false;
      if (game.snapshot().battle.name.startsWith('野外挑战')) return true;
      game.dispatch({type: 'flee'});
      game.dispatch({type: 'closeBattle'});
      return false;
    });
    assert.ok(recruit, 'the catalog has a recruit-only species');
    const {name, log} = game.snapshot().battle;
    assert.deepEqual([name, log[0]], [`野外挑战：${recruit.name.zh}`, `${name}。`]);
  });

  t.check('A forced replacement is reported once the controller accepts it; a voluntary switch is not', () => {
    const save = structuredClone(base), lead = save.storage.find(mon => mon.uid === save.party[0]);
    lead.hp = 1;
    const game = started({type: 'startTraining', species: 22, level: 3}, catalog, save), ui = screen(game);
    for (let turn = 0; turn < 10 && !game.snapshot().battle.needsSwitch; turn++) {
      ui.player.submit({type: 'move', skillId: game.snapshot().battle.player.skills.find(skill => skill.pp > 0).id});
      ui.rerender();
      ui.clock.runAll();
    }
    const fainted = game.snapshot().battle, bench = fainted.party.filter(mon => mon.hp > 0);
    assert.ok(fainted.needsSwitch && !fainted.finished, 'the lead faints');
    assert.deepEqual(ui.events.filter(event => event !== 'start'), ['needsSwitch']);
    ui.player.submit({type: 'switch', uid: bench[0].uid});
    assert.deepEqual(ui.events.filter(event => event !== 'start'), ['needsSwitch', 'replaced']);
    ui.rerender();
    ui.clock.runAll();
    assert.equal(game.snapshot().battle.needsSwitch, false);
    ui.player.submit({type: 'switch', uid: bench[1].uid});
    ui.rerender();
    ui.clock.runAll();
    assert.equal(game.snapshot().battle.player.uid, bench[1].uid);
    assert.deepEqual(ui.events.filter(event => event !== 'start'), ['needsSwitch', 'replaced']);
  });

  t.check('A screen that unmounts while a turn plays lets idle work go', () => {
    const game = wild(), ui = screen(game);
    ui.player.submit({type: 'move', skillId: game.snapshot().battle.player.skills[0].id});
    ui.rerender();
    assert.equal(ui.idle.holds, 1);
    ui.player.dispose();
    ui.player.dispose();
    assert.equal(ui.idle.holds, 0);
  });

  await t.checkAsync('Turn preparation waits while a turn plays and runs once its last frame shows, before the commands unlock', async () => {
    const levelled = await levelledGames(load), runs = [], macrotask = () => new Promise(resolve => setTimeout(resolve, 5));
    let ui;
    // The browser's idle slots (timers in Node), observed: each preparation records whether a turn was still playing.
    const game = levelled({idle: task => idleSlots.whenIdle(() => { runs.push(ui.player.state().busy); task(); })});
    assert.ok(game.dispatch({type: 'startBattle', bossId: 'trainer_attrition'}).ok);
    ui = screen(game, {holdIdle: idleSlots.holdIdle});
    await macrotask();
    assert.deepEqual(runs, [false], 'the opening turn is prepared in the first idle slot');
    ui.player.submit({type: 'move', skillId: game.snapshot().battle.player.skills.find(skill => skill.pp > 0).id});
    ui.rerender();
    const {frames} = game.snapshot().battle.animation;
    assert.ok(frames.length > 2);
    for (await macrotask(); ui.player.state().frame !== frames.at(-1); await macrotask()) {
      assert.deepEqual(runs, [false], 'no preparation while the turn plays');
      ui.clock.step();
    }
    await macrotask();
    assert.deepEqual(runs, [false, true], 'prepared while the last frame shows');
    ui.clock.runAll();
    assert.equal(ui.player.state().busy, false);
    ui.player.dispose();
  });

  t.finish();
});
