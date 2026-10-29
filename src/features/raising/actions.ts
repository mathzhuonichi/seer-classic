// Action handlers that raise and organise owned monsters, including the editor's cheats.
import {
  addEvs, allocatePoolExp, changeNature, computeStats, deposit, equipSkills, EV_STAT_CAP, EV_TOTAL_CAP, evolutionOptions, evolve, evTotal, findMon, gainLevels,
  healAll, IV_MAX, IV_MIN, MAX_LEVEL, rename, requiresEvolutionChoice, setFavorite, setIv, setPartyOrder, STAT_KEYS, swapWithBox, withdraw, type Monster,
} from '../../../raising/core/index.ts';
import { traits } from '../../domain/traits.ts';
import { STAT_LABELS } from '../../shared/labels.ts';
import { acquire, boundedAutoEvolve, ensureSpeciesCapacity } from '../../kernel/acquire.ts';
import { TRAINING_COST_PER_EV } from '../../domain/economy.ts';
import { commit, notice, replaceMonster, type ActionHandler, type Feature } from '../../kernel/api.ts';
import type { RaisingAction } from './feature.ts';


/** The editor's default level for an added monster. */
const EDITOR_ACQUIRE_LEVEL = 5;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const setEvs: ActionHandler<'setEvs'> = (rt, action) => {
  if (STAT_KEYS.some(key => !Number.isInteger(action.evs[key]) || action.evs[key] < 0 || action.evs[key] > EV_STAT_CAP)) {
    throw new Error(`学习力每项须为 0–${EV_STAT_CAP} 的整数。`);
  }
  const total = evTotal(action.evs);
  if (total > EV_TOTAL_CAP) throw new Error(`学习力总和 ${total} 超过 ${EV_TOTAL_CAP}，请调整后再应用。`);
  const mon = { ...findMon(rt.save, action.uid), evs: { ...action.evs } };
  mon.hp = Math.min(mon.hp, computeStats(mon, rt.ctx.dex).hp);
  replaceMonster(rt, mon);
  notice(rt, '学习力已保存，能力值已更新。');
};

const train: ActionHandler<'train'> = (rt, action) => {
  const amount = Math.max(1, Math.floor(action.amount));
  if (rt.save.game.coins < amount * TRAINING_COST_PER_EV) throw new Error('赛尔豆不足。');
  const old = findMon(rt.save, action.uid), next = addEvs(old, { [action.stat]: amount }).mon;
  const gain = next.evs[action.stat] - old.evs[action.stat];
  if (!gain) throw new Error('学习力已达到上限。');
  replaceMonster(rt, next);
  rt.save.game.coins -= gain * TRAINING_COST_PER_EV;
  notice(rt, `${STAT_LABELS[action.stat]}学习力增加 ${gain}。`);
};

const setSkin: ActionHandler<'setSkin'> = (rt, action) => {
  const mon = findMon(rt.save, action.uid), target = action.species === null ? mon.species : action.species;
  if (!Number.isInteger(target) || !rt.ctx.skinOptions.get(mon.species)?.includes(target)) throw new Error('只能选择当前形态或其进化前形态作为皮肤。');
  const next = { ...mon };
  if (target === mon.species) delete next.skinSpecies; else next.skinSpecies = target;
  replaceMonster(rt, next);
  notice(rt, `外观已设为${rt.ctx.speciesName(target)}，能力与技能保持不变。`);
};

const evolveAction: ActionHandler<'evolve'> = (rt, action) => {
  const { dex } = rt.ctx, mon = findMon(rt.save, action.uid), options = evolutionOptions(mon, dex);
  if (action.toSpecies === undefined && requiresEvolutionChoice(mon, dex)) throw new Error('请选择要进化的分支。');
  const target = action.toSpecies ?? options[0];
  if (target === undefined || !options.includes(target)) throw new Error('尚未满足所选形态的进化条件。');
  ensureSpeciesCapacity(rt.ctx, rt.save, target, mon.uid);
  replaceMonster(rt, evolve(mon, target, dex).mon);
  notice(rt, `${rt.ctx.speciesName(mon.species)}已进化为${rt.ctx.speciesName(target)}！`);
};

/** Editor: totals are filled in stat order until the overall cap runs out. */
function cappedEvs(current: Monster['evs'], requested: Partial<Monster['evs']>): Monster['evs'] {
  const next = { ...current, ...requested };
  let left = EV_TOTAL_CAP;
  for (const key of STAT_KEYS) {
    next[key] = Math.min(left, Math.max(0, Math.min(EV_STAT_CAP, Math.floor(next[key]))));
    left -= next[key];
  }
  return next;
}

const cheatMonster: ActionHandler<'cheatMonster'> = (rt, action) => {
  const { dex } = rt.ctx;
  if (action.traitId && !traits.some(trait => trait.id === action.traitId)) throw new Error('特性不存在。');
  let mon = findMon(rt.save, action.uid);
  if (action.level !== undefined) mon = boundedAutoEvolve(rt, gainLevels(mon, clamp(Math.floor(action.level), 1, MAX_LEVEL) - mon.level, dex).mon);
  if (action.iv !== undefined) mon = setIv(mon, clamp(Math.floor(action.iv), IV_MIN, IV_MAX), dex).mon;
  if (action.nature) mon = changeNature(mon, action.nature, dex).mon;
  if (action.evs) mon = { ...mon, evs: cappedEvs(mon.evs, action.evs) };
  mon = { ...mon, hp: computeStats(mon, dex).hp };
  replaceMonster(rt, mon);
  const deficit = rt.save.game.modules[action.uid]?.engravingDeficit;
  if (deficit) deficit.hp = 0;
  if (action.traitId) rt.save.game.traits[mon.uid] = action.traitId;
  else if (action.traitId !== undefined) delete rt.save.game.traits[mon.uid];
  notice(rt, `已修改 ${mon.nickname || rt.ctx.speciesName(mon.species)} · Lv.${mon.level} · 个体值 ${mon.iv}。`);
};

export const raisingActions = {
  heal: rt => {
    commit(rt, healAll(rt.save, rt.ctx.dex));
    for (const mods of Object.values(rt.save.game.modules)) delete mods.engravingDeficit;
    notice(rt, '恢复舱已恢复全部精灵的体力与技能 PP。');
  },
  party: (rt, action) => commit(rt, action.add ? withdraw(rt.save, action.uid) : deposit(rt.save, action.uid)),
  reorderParty: (rt, action) => {
    commit(rt, setPartyOrder(rt.save, action.uids));
    notice(rt, '出战顺序已调整。');
  },
  swapWithBox: (rt, action) => commit(rt, swapWithBox(rt.save, action.partyUid, action.boxUid)),
  favorite: (rt, action) => commit(rt, setFavorite(rt.save, action.uid, action.favorite)),
  setEvs,
  rename: (rt, action) => commit(rt, rename(rt.save, action.uid, action.name || null)),
  equip: (rt, action) => replaceMonster(rt, equipSkills(findMon(rt.save, action.uid), action.skills, rt.ctx.dex)),
  train,
  allocateExp: (rt, action) => {
    commit(rt, allocatePoolExp(rt.save, action.uid, action.amount, rt.ctx.dex).save);
    replaceMonster(rt, boundedAutoEvolve(rt, findMon(rt.save, action.uid)));
  },
  setSkin,
  evolve: evolveAction,
  cheatMonster,
  cheatAcquire: (rt, action) => { acquire(rt, action.species, action.level ?? EDITOR_ACQUIRE_LEVEL, 'editor'); },
  cheatResources: (rt, action) => {
    if (action.coins !== undefined) rt.save.game.coins = Math.max(0, Math.floor(action.coins));
    if (action.expPool !== undefined) rt.save.exp_pool = Math.max(0, Math.floor(action.expPool));
  },
} satisfies Feature<RaisingAction>['actions'];
