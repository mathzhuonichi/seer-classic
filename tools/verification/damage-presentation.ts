import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, advanceBattlePresentation, type BattlePresentationState } from '../../src/kernel/game.ts';
import { displayedDamage, battleEventText } from '../../src/features/battle/battle-log.ts';
import type { CatalogData } from '../../src/domain/catalog/catalog.ts';

// Isolated catalog and save fixtures; this runner never accesses browser storage.
const catalog = JSON.parse(fs.readFileSync('data/gamedata.json', 'utf8'));
const attackId = 990001, waitId = 990002, reviveId = 'audit_bench_revive';
catalog.skills.push(
  { id: attackId, name: { zh: '伤害演示' }, type: 'normal', category: 'physical', power: 10000, accuracy: null, pp: 10, effects: [{ op: 'heal', target: 'self', pct_damage_dealt: 100 }] },
  { id: waitId, name: { zh: '等待' }, type: 'normal', category: 'status', power: 0, accuracy: null, pp: 10, effects: [] },
);
catalog.species.find((s: any) => s.id === 1).learnset = [{ level: 1, skill: attackId }];
catalog.items.push({ id: reviveId, name: { zh: '演示复苏剂' }, kind: 'battle', battle_effects: [{ op: 'revive', pct_max_hp: 50 }] });
const foe = (species: number, hp: number) => ({ species, level: 1, hp_override: hp, stats: { hp, atk: 1, def: 100, spa: 1, spd: 100, spe: 1 }, skills: [waitId] });
catalog.bosses = [
  { id: 'audit-two-opponents', name: { zh: '双精灵演示' }, team: [foe(10, 7), foe(13, 11)], ai: { kind: 'sequence', skills: [waitId] } },
  { id: 'audit-extra-life', name: { zh: '复苏演示' }, team: [foe(10, 7)], rules: [{ rule: 'lives', count: 1 }], ai: { kind: 'sequence', skills: [waitId] } },
];
const seedGame = createGame(structuredClone(catalog) as CatalogData);
for (const uid of seedGame.snapshot().party) seedGame.dispatch({ type: 'cheatMonster', uid, iv: 31, nature: 'hardy', traitId: null });
const raw = JSON.parse(seedGame.exportSave());
raw.seed = 42; raw.rng_state = null;
raw.game.traits = {};
const lead = raw.storage.find((m: any) => m.uid === raw.party[0]);
const leadMaxHp = seedGame.snapshot().monsters.find(m => m.uid === lead.uid)!.stats.hp;
lead.hp = leadMaxHp - 10;
const reserveUid = raw.party[1];
raw.storage.find((m: any) => m.uid === reserveUid).hp = 0;
const fresh = () => createGame(structuredClone(catalog), JSON.stringify(raw));

const game = fresh();
game.dispatch({ type: 'startBattle', bossId: 'audit-two-opponents' });
assert(game.snapshot().battle, game.snapshot().notices[0]);
game.dispatch({ type: 'move', skillId: attackId });
const result = game.snapshot().battle!, frames = result.animation.frames;
assert(frames.every(frame => frame.party.length === 3 && frame.enemyParty.length === 2));
const hitIndex = frames.findIndex(frame => frame.kind === 'hit' && frame.side === 1);
assert(hitIndex > 0);
const hit = frames[hitIndex];
assert(hit.amount! > 7, 'A lethal hit must display damage beyond the seven HP actually lost.');
assert(hit.text.includes(`受到 ${hit.amount} 点伤害`));
assert(result.log.some(line => line.includes(`受到 ${hit.amount} 点伤害`)));
assert.equal(hit.enemyHp, 0);
assert.equal(frames[hitIndex - 1].enemyParty[0].hp, 7, 'Earlier frames retain pre-hit HP after resolution.');
assert.equal(hit.enemyParty[0].hp, 0);
assert.equal(hit.enemyParty[1].hp, 11);
assert.equal(hit.enemy.slot, 0, 'The defeated opponent remains active until its switch event.');
const faint = frames.slice(hitIndex + 1).find(frame => frame.enemyParty[0].fainted)!;
assert(faint.enemyParty[0].fainted);
const enemySwitch = frames.find(frame => frame.kind === 'switch' && frame.side === 1)!;
assert.equal(enemySwitch.enemy.slot, 1);
assert.equal(enemySwitch.enemy.hp, 11);
assert.equal(enemySwitch.enemyParty[0].hp, 0);
assert.equal(result.player.hp, leadMaxHp - 3, 'The 100% drain heals the actual seven HP loss, not the displayed full hit.');
assert(frames.some(frame => frame.kind === 'heal' && frame.amount === 7));
assert.equal(frames[hitIndex - 1].enemyParty[0].hp, 7, 'Later replay must not mutate an earlier snapshot.');

game.dispatch({ type: 'battleItem', itemId: reviveId, targetUid: reserveUid });
const reviveFrames = game.snapshot().battle!.animation.frames;
const revivedIndex = reviveFrames.findIndex(frame => frame.party[1].hp > 0);
assert(revivedIndex > 0);
assert.equal(reviveFrames[revivedIndex - 1].party[1].hp, 0);
assert.equal(reviveFrames[revivedIndex].party[1].fainted, false);
assert.equal(reviveFrames[revivedIndex].player.uid, lead.uid, 'Bench revival leaves the active creature in place.');
assert.equal(reviveFrames[revivedIndex].player.hp, leadMaxHp - 3);
game.dispatch({ type: 'switch', uid: reserveUid });
const switchFrames = game.snapshot().battle!.animation.frames;
const playerSwitchIndex = switchFrames.findIndex(frame => frame.kind === 'switch' && frame.side === 0);
assert(playerSwitchIndex > 0);
assert.equal(switchFrames[playerSwitchIndex - 1].player.uid, lead.uid);
assert.equal(switchFrames[playerSwitchIndex].player.uid, reserveUid);
assert.equal(switchFrames[playerSwitchIndex].party[0].hp, leadMaxHp - 3);

const life = fresh(); life.dispatch({ type: 'startBattle', bossId: 'audit-extra-life' }); life.dispatch({ type: 'move', skillId: attackId });
const lifeFrames = life.snapshot().battle!.animation.frames;
const lethalIndex = lifeFrames.findIndex(frame => frame.kind === 'hit' && frame.side === 1);
const revivedEnemyIndex = lifeFrames.findIndex((frame, index) => index > lethalIndex && frame.kind === 'heal' && frame.side === 1);
assert(lethalIndex >= 0 && revivedEnemyIndex > lethalIndex);
assert.equal(lifeFrames[lethalIndex].enemyParty[0].hp, 0);
assert.equal(lifeFrames[revivedEnemyIndex].enemyParty[0].hp, 7);
assert.equal(lifeFrames[revivedEnemyIndex].enemyParty[0].fainted, false);

// A detached bench event exercises slot routing even when the active has the same species.
const state: BattlePresentationState = structuredClone({ player: result.player, enemy: result.enemy, party: result.party, enemyParty: result.enemyParty });
state.party[2].hp = 5;
const benchHit = advanceBattlePresentation(state, { type: 'damage', side: 0, slot: 2, hp: 0, amount: 5, overkill: 20 });
const benchFaint = advanceBattlePresentation(benchHit, { type: 'faint', side: 0, slot: 2 });
assert.equal(benchFaint.party[2].fainted, true);
assert.equal(benchFaint.player.hp, state.player.hp);
assert.equal(state.party[2].hp, 5);
const transformed = advanceBattlePresentation(state, { type: 'transform', side: 1, species: 13, name: '新形态', hp: 20, maxHp: 20 });
assert.equal(transformed.enemy.name, '新形态');
assert.equal(transformed.enemyParty.find(mon => mon.uid === state.enemy.uid)!.hp, 20);
assert.equal(state.enemy.name, result.enemy.name);
assert.equal(displayedDamage({ type: 'damage', amount: 7, overkill: 93 }), 100);
const text = battleEventText({ type: 'damage', side: 1, amount: 7, overkill: 93, hp: 0, maxHp: 7 }, {
  data: { species: new Map(), skills: new Map(), items: new Map() }, initialPlayer: state.player, initialEnemy: { name: '目标', hp: 7, maxHp: 7 },
});
assert(text.includes('受到 100 点伤害') && text.includes('剩余体力 0/7'));
console.log(JSON.stringify({ passed: ['full overkill popup and log', 'actual-loss HP and drain', 'event-ordered enemy knockout and switch', 'bench revival and player switch', 'enemy revival after lethal damage', 'slot-specific bench faint and immutable earlier snapshots', 'renamed transformation remains in the active slot'], displayedLethalDamage: hit.amount, actualLoss: 7 }));
