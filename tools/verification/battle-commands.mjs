/**
 * The battle screen's commands against real controllers: the capture rule the view and the capture action share, and the
 * production playback player (battle-player.ts) on a manual clock: the command lock, the canAct guard, the capture frames, the
 * forced replacement, the lines a capture and a wild victory say, each once, each outcome named once by the last dialogue line (the
 * closing notice), a wild monster's flee that pays nothing and leaves the arena, 尼奥's flee unless a 尼尔-line partner is out and
 * its farewell, a wild loss after a knockout that pays no pooled experience, a 挣扎 turn that ends a Boss battle (its frames
 * and its settlement), a settlement that outlives a failed presentation, and the hold on turn preparation while a turn plays.
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
  const [{createGame}, {loadCatalog}, {createBattlePlayer}, {CAPTURE_OUTCOME_MS}, {battleResultTitle}, {VICTORY_REWARDS}, idleSlots, core] =
    await Promise.all([
      '/src/kernel/game.ts', '/src/domain/catalog/catalog.ts', '/src/features/battle/battle-player.ts', '/src/features/battle/battle-playback.ts',
      '/src/features/battle/battle-hud.ts', '/src/domain/economy.ts', '/src/shared/idle.ts', '/battle/core/src/index.ts'].map(load));
  const {Battle, MAX_TURNS, STRUGGLE_SKILL} = core;
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
    const blocked = {boss: {type: 'startBattle', bossId: catalog.bosses[0].id}, trainer: {type: 'startFacility', facilityId: 'random'}};
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
  const wild = (input = catalog, species = 22) => started({type: 'startTraining', species, level: 3}, input);
  const failing = structuredClone(catalog);
  failing.species.find(species => species.id === 22).catch_rate = 0;

  t.check('A capsule that catches: one dispatch, the capsule frames, then a finished battle that takes no command', () => {
    const game = wild(), ui = screen(game), capture = {type: 'capture', itemId: 'item_capsule_master'};
    const foe = game.snapshot().battle.enemy.name, {coins, exp} = VICTORY_REWARDS.wild;
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
      `${foe}已加入背包。获得 ${coins} 赛尔豆及 ${exp} 积累经验。`], 'each line once: the capsule, its outcome, where the catch went and what the victory paid');
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
  /** A controller (createGame with `dependencies`) on the seeded journey with its lead at Lv 100, that has started `start`. */
  const levelledLead = (start, input = catalog, dependencies = {}) => {
    const game = createGame(input, JSON.stringify(base), {idle: () => {}, ...dependencies});
    game.dispatch({type: 'cheatMonster', uid: game.snapshot().party[0], level: 100});
    assert.ok(game.dispatch(start).ok && game.snapshot().battle, start.type);
    return game;
  };

  const isTurnHeader = line => /^第 \d+ 回合$/.test(line);
  /** The dialogue since the last turn header. */
  const lastTurn = ui => ui.dialogue.slice(ui.dialogue.findLastIndex(isTurnHeader));
  /** Words that name a battle's outcome. A flee line (the player's or the wild monster's) is the flee itself, not a line about it. */
  const NAMES_OUTCOME = /胜利|成功|失败|平局|撤离|逃跑/, FLEE_LINE = '我方撤离了战斗。';
  /** 该伊 (474) flees from its 5th turn (battle/RULES.md 9.1). */
  const FLEEING_SPECIES = 474, FLEE_TURN = 5, WILD_FLEE_LINE = '该伊逃跑了！', WILD_FLED_TEXT = '很可惜，这只精灵逃跑了！';
  const outcomeLines = ui => lastTurn(ui).filter(line => NAMES_OUTCOME.test(line) && line !== FLEE_LINE && line !== WILD_FLEE_LINE);

  /** What the settled battle in `game` paid since `before` (its exported save), in the result text's words. */
  const paidText = (game, before) => {
    const after = JSON.parse(game.exportSave()), coins = after.game.coins - before.game.coins, exp = after.exp_pool - before.exp_pool;
    return coins ? `获得 ${coins} 赛尔豆及 ${exp} 积累经验。` : `获得 ${exp} 积累经验。`;
  };

  t.check('A wild victory says it once and names what it paid: the coins, and the pooled experience with the Lv 100 lead\'s knockout share', () => {
    const game = levelledLead({type: 'startTraining', species: 22, level: 3}), ui = screen(game), before = JSON.parse(game.exportSave());
    const foe = game.snapshot().battle.enemy.name, {coins, exp} = VICTORY_REWARDS.wild;
    const view = playOut(game, ui, {turns: 5}), reward = paidText(game, before), after = JSON.parse(game.exportSave());
    assert.ok(view.won, 'the levelled lead wins');
    assert.equal(after.game.coins - before.game.coins, coins);
    assert.ok(after.exp_pool - before.exp_pool > exp, 'the Lv 100 lead passes its knockout experience to the pool');
    assert.deepEqual(ui.dialogue.slice(-3), [`${foe}失去战斗能力。`, '战斗胜利！', reward]);
    assert.equal(view.result, reward);
    assert.equal(game.snapshot().notices[0], reward, 'the settlement notice states the same payout');
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
    // [game, its title, the last two dialogue lines (how it ended, then the result text), play options]; a win's result text
    // ends with what it paid, which the save shows once it has settled.
    const outcomes = {
      'wild retreat': [wild(), '已撤离战斗', [FLEE_LINE, '本次撤离不发放战斗奖励。'], {action: {type: 'flee'}}],
      'wild flee': [wild(stalled, FLEEING_SPECIES), '精灵逃跑了', [WILD_FLEE_LINE, WILD_FLED_TEXT]],
      'wild loss': [lost({type: 'startTraining', species: 22, level: 100}), '战斗失败', ['战斗结束。', '战斗失败，可恢复精灵后继续探索。']],
      'wild draw': [wild(stalled), '本场平局', [`已达到 ${MAX_TURNS} 回合上限。`, '本场平局，可恢复精灵后继续探索。'], {turns: MAX_TURNS}],
      'challenge loss': [lost({type: 'startBattle', bossId: catalog.bosses[0].id}), '挑战失败', ['战斗结束。', '挑战失败，可恢复后再次挑战。']],
      'challenge win': [levelledLead({type: 'startBattle', bossId: PLAIN_TRAINER}, plain), '战斗胜利！', ['战斗结束。', '挑战成功，奖励已入账。']],
    };
    const said = {};
    for (const [name, [game, title, outcome, options]] of Object.entries(outcomes)) {
      const ui = screen(game), before = JSON.parse(game.exportSave()), view = playOut(game, ui, options), turn = lastTurn(ui);
      const ending = view.won ? [outcome[0], outcome[1] + paidText(game, before)] : outcome;
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

  t.check('A wild monster that flees runs off in its turn, pays nothing and keeps the team\'s HP and PP as the battle left them', () => {
    const game = wild(stalled, FLEEING_SPECIES), ui = screen(game), before = game.exportSave();
    const view = playOut(game, ui), state = ui.player.state(), save = JSON.parse(game.exportSave());
    assert.deepEqual([view.finished, view.won, view.resultReason, view.turn, view.captured], [true, false, 'wild_fled', FLEE_TURN, false]);
    assert.deepEqual(view.animation.frames.filter(frame => frame.kind === 'flee').map(frame => [frame.side, frame.text]), [[1, WILD_FLEE_LINE]]);
    assert.deepEqual([state.foeFled, state.busy, ui.dialogue.at(-1), view.result], [true, false, WILD_FLED_TEXT, WILD_FLED_TEXT]);
    const was = JSON.parse(before), lead = was.party[0], mon = save => save.storage.find(entry => entry.uid === lead);
    const purse = save => [save.game.battlesWon, save.game.coins, save.exp_pool];
    assert.deepEqual(purse(save), purse(was), 'no victory, coins or pooled experience');
    assert.deepEqual([save.storage.length, mon(save).exp, mon(save).evs], [was.storage.length, mon(was).exp, mon(was).evs], 'no capture, EXP or 学习力');
    for (const entry of view.party) {
      const saved = save.storage.find(m => m.uid === entry.uid);
      assert.deepEqual([saved.hp, entry.skills.map(skill => saved.pp[skill.id])], [entry.hp, entry.skills.map(skill => skill.pp)], 'HP and PP as the battle left them');
    }
    assert.ok(ui.sounds.every(sound => sound === 'click'), 'a flee ends without a jingle');
  });

  /** 尼奥 (416) flees unless one of the 尼尔 line is out (battle/RULES.md 9.1), then says its farewell in the scene. */
  const NIAO = 416, NIAO_FAREWELL = {species: NIAO, name: '尼奥', line: '我是来找我弟弟的，你看见他了吗？', reply: '你弟弟到底是谁呢？好像我记得有只精灵和你长得很像。'};
  /** A controller on the stalled journey with a Lv 5 尼尔 (77) in the party, leading when `partnerLeads`, that has met 尼奥. */
  const niao = partnerLeads => {
    const game = createGame(stalled, JSON.stringify(base), {idle: () => {}});
    game.dispatch({type: 'cheatAcquire', species: 77, level: 5});
    const partner = game.snapshot().monsters.find(mon => mon.species === 77).uid, others = game.snapshot().party.filter(uid => uid !== partner);
    game.dispatch({type: 'reorderParty', uids: partnerLeads ? [partner, ...others] : [...others, partner]});
    assert.ok(game.dispatch({type: 'startTraining', species: NIAO, level: 5}).ok);
    return {game, ui: screen(game), partner, other: others[0]};
  };
  /** The flee frames of the settled view and its end: the turn, the reason, the capture, the last dialogue line and the farewell. */
  const fleeEnd = (view, ui) => ({flees: view.animation.frames.filter(frame => frame.kind === 'flee').map(frame => frame.text), turn: view.turn,
    reason: view.resultReason, captured: view.captured, said: ui.dialogue.at(-1), farewell: view.farewell});
  const niaoFled = (turn, line = '尼奥逃跑了！') => ({flees: [line], turn, reason: 'wild_fled', captured: false, said: WILD_FLED_TEXT, farewell: NIAO_FAREWELL});

  t.check('尼奥 flees at its first action with another lead, and at its action after a switch away from 尼尔; each flee leaves its farewell', () => {
    const led = niao(false), skill = () => ({type: 'move', skillId: led.game.snapshot().battle.player.skills[0].id});
    assert.deepEqual(fleeEnd(playOut(led.game, led.ui, {action: skill(), turns: 1}), led.ui), niaoFled(1));
    assert.ok(led.ui.sounds.every(sound => sound === 'click'), 'no end music');
    const left = niao(true), stay = playOut(left.game, left.ui, {action: {type: 'move', skillId: left.game.snapshot().battle.player.skills[0].id}, turns: 2});
    assert.deepEqual([stay.finished, stay.turn, stay.farewell], [false, 2, undefined], 'with 尼尔 out it fights on');
    const view = playOut(left.game, left.ui, {action: {type: 'switch', uid: left.other}, turns: 1});
    assert.deepEqual(fleeEnd(view, left.ui), niaoFled(3));
    const kinds = view.animation.frames.map(frame => frame.kind);
    assert.ok(kinds.indexOf('switch') < kinds.indexOf('flee'), 'the switch comes first, then the flee');
  });

  t.check('尼奥 flees at a capsule thrown with another lead, with no capture frame; with 尼尔 out a capsule catches it', () => {
    const thrown = niao(false), view = playOut(thrown.game, thrown.ui, {action: {type: 'capture', itemId: 'item_capsule_basic'}, turns: 1});
    assert.deepEqual(fleeEnd(view, thrown.ui), niaoFled(1, '我方使用了普通精灵胶囊，尼奥逃跑了！'));
    assert.ok(!view.animation.frames.some(frame => frame.kind === 'capture'), 'no capsule is rolled');
    const caught = niao(true), stored = () => JSON.parse(caught.game.exportSave()).storage.length, before = stored();
    const won = playOut(caught.game, caught.ui, {action: {type: 'capture', itemId: 'item_capsule_master'}, turns: 1});
    assert.deepEqual([won.captured, won.resultReason, won.farewell, stored()], [true, 'capture', undefined, before + 1]);
  });

  t.check('A wild loss after a knockout adds no pooled experience, since the knockout\'s participant fell, and names only the loss', () => {
    // The lone Lv 100 lead on 1 HP and out of PP knocks the 1-HP foe out with 挣扎 and falls to the recoil: both fall, a loss.
    let battle;
    const game = createGame(catalog, JSON.stringify(lastStand()), {idle: () => {}, createBattle: options => (battle = new Battle(options))});
    game.dispatch({type: 'cheatMonster', uid: game.snapshot().party[0], level: 100});
    assert.ok(game.dispatch({type: 'startTraining', species: 22, level: 3}).ok);
    const [lead, foe] = [battle.active(0), battle.active(1)];
    for (const mon of [lead, foe]) { for (const id of mon.skills) mon.pp[id] = 0; mon.hp = 1; }
    lead.stats.spe = foe.stats.spe + 1;
    const ui = screen(game), before = JSON.parse(game.exportSave()), notices = game.snapshot().notices.length;
    const view = playOut(game, ui, {action: {type: 'move', skillId: STRUGGLE_SKILL.id}, turns: 1}), after = JSON.parse(game.exportSave());
    assert.deepEqual([view.finished, view.won, view.resultReason, battle.result.defeated.length], [true, false, 'ko', 1], 'the foe fell first, then the lead');
    assert.equal(after.exp_pool, before.exp_pool, 'a fallen participant takes no knockout share');
    assert.deepEqual(ui.dialogue.slice(-2), ['战斗结束。', '战斗失败，可恢复精灵后继续探索。'], 'the result names the loss and no payout');
    assert.deepEqual([view.result, game.snapshot().notices.length], ['战斗失败，可恢复精灵后继续探索。', notices], 'no settlement notice');
  });

  /** An SPT Boss whose win pays its essence; an SPT Boss out of PP stands still (battle/RULES.md 4). */
  const SPT_BOSS = 'boss_spt_silipu', SPT_ESSENCE = 'essence_boss_spt_silipu';
  /** What the save holds of a win over the Boss: its clear, the battles won, the coins and its essence. */
  const bossRecord = game => {
    const save = JSON.parse(game.exportSave());
    const {battlesWon: won, coins} = save.game;
    return {cleared: save.progress.bosses_cleared.includes(SPT_BOSS), won, coins, essence: save.items[SPT_ESSENCE] ?? 0};
  };
  const settledWin = before => ({cleared: true, won: before.won + 1, coins: before.coins + VICTORY_REWARDS.encounter.coins, essence: before.essence + 1});
  /** The levelled lead against the Boss, and the engine battle the controller built; `wrap` stands in for that battle. */
  const bossBattle = (wrap = battle => battle) => {
    let battle;
    const game = levelledLead({type: 'startBattle', bossId: SPT_BOSS}, catalog, {createBattle: options => (battle = wrap(new Battle(options)))});
    return {game, battle};
  };

  t.check('A Boss out of PP stands still: the lead\'s move is the turn\'s only move, and the win is settled', () => {
    const {game, battle} = bossBattle(), [lead, boss] = [battle.active(0), battle.active(1)];
    // The Boss has spent its PP and has 1 HP left; it acts first and stands still, and the lead's sure hit ends the battle.
    for (const id of boss.skills) boss.pp[id] = 0;
    boss.hp = 1;
    lead.stats.spe = 1;
    lead.stages.acc = 6;
    const before = bossRecord(game), ui = screen(game), skill = strongest(game.snapshot().battle);
    ui.player.submit({type: 'move', skillId: skill.id});
    ui.rerender();
    ui.clock.runAll();
    const view = game.snapshot().battle, moves = view.animation.frames.filter(frame => frame.skillId !== undefined);
    assert.deepEqual(moves.map(frame => [frame.side, frame.skillId]), [[0, skill.id]], 'the lead\'s move is the only move');
    assert.ok(ui.dialogue.includes(`${view.enemy.name}无法行动。`), 'the log says the Boss cannot act');
    assert.deepEqual([view.finished, view.won, ui.dialogue.at(-1)], [true, true, view.result], 'the screen ends on the result text');
    assert.deepEqual(bossRecord(game), settledWin(before), 'cleared, one more battle won, the victory coins and the essence');
  });

  t.check('A won turn whose presentation fails is still settled, and the screen says the failure, not the win', () => {
    // The engine's events end with a move the frames cannot resolve: a skill the catalog does not hold.
    const {game, battle} = bossBattle(battle => {
      const resolve = battle.resolveTurn.bind(battle);
      battle.resolveTurn = () => [...resolve(), {type: 'move_used', side: 1, skill: -1, name: ''}];
      return battle;
    });
    battle.active(1).hp = 1;
    const before = bossRecord(game), {revision} = game.snapshot().battle.animation, ui = screen(game);
    ui.player.submit({type: 'move', skillId: strongest(game.snapshot().battle).id});
    const view = game.snapshot().battle, said = ui.player.state().dialogue;
    assert.deepEqual([view.finished, view.won], [true, true]);
    assert.deepEqual([said, ui.player.state().busy], [game.snapshot().notices[0], false], 'the failure is reported and the commands unlock');
    assert.notEqual(said, view.result);
    assert.equal(view.animation.revision, revision, 'no frames are published, so the last turn is not played again');
    assert.deepEqual(bossRecord(game), settledWin(before), 'the presentation error does not drop the settlement');
  });

  // The first catalog species met as a recruit; the contacts before it open a wild battle or a Boss, which the player leaves.
  const recruit = (() => {
    const game = createGame(catalog, JSON.stringify(base), {idle: () => {}});
    return catalog.species.find(({id}) => {
      if (!game.dispatch({type: 'startTraining', species: id, level: 5}).ok || !game.snapshot().battle) return false;
      if (game.snapshot().battle.name.startsWith('野外挑战')) return true;
      game.dispatch({type: 'flee'});
      game.dispatch({type: 'closeBattle'});
      return false;
    });
  })();

  t.check('A field recruit, whose name already says 野外挑战, opens with its name alone', () => {
    assert.ok(recruit, 'the catalog has a recruit-only species');
    const {name, log} = started({type: 'startTraining', species: recruit.id, level: 5}).snapshot().battle;
    assert.deepEqual([name, log[0]], [`野外挑战：${recruit.name.zh}`, `${name}。`]);
  });

  t.check('A won field recruit names the essence it paid as its creature\'s, not a Boss\'s, then what the win paid', () => {
    const game = levelledLead({type: 'startTraining', species: recruit.id, level: 5}), ui = screen(game), before = JSON.parse(game.exportSave());
    const view = playOut(game, ui), essence = game.snapshot().items.find(item => item.id === `essence_recruit_${recruit.id}`);
    assert.ok(view.won && essence?.count === 1, 'the levelled lead wins the essence');
    assert.equal(essence.name, `${recruit.name.zh}精元`);
    assert.equal(view.result, `${essence.name}已入库，到道具背包的精元页即可孵化。${paidText(game, before)}`);
    assert.ok(!view.result.includes('首领'));
  });

  t.check('A command reports whether the controller took it: a forced replacement, a voluntary switch, a refused switch', () => {
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
    assert.equal(ui.player.submit({type: 'switch', uid: fainted.player.uid}), false, 'the fainted lead cannot go back in');
    assert.equal(ui.player.submit({type: 'switch', uid: bench[0].uid}), true);
    ui.rerender();
    ui.clock.runAll();
    assert.equal(game.snapshot().battle.needsSwitch, false);
    assert.equal(ui.player.submit({type: 'switch', uid: bench[1].uid}), true);
    ui.rerender();
    ui.clock.runAll();
    assert.equal(game.snapshot().battle.player.uid, bench[1].uid);
    assert.deepEqual(ui.events.filter(event => event !== 'start'), ['needsSwitch']);
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
