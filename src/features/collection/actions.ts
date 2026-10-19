// Action handlers for fusion and breeding.
import { findMon } from '../../../raising/core/index.ts';
import { BREEDING_RECIPES, canBreedParents, chooseBreedingOutcome } from '../../domain/recipes/breeding.ts';
import { FUSION_RECIPES, canFuseParents, chooseFusionOutcome, fusionBeadItemId } from '../../domain/recipes/fusion.ts';
import { acquire, allowance, capacityReason } from '../../kernel/acquire.ts';
import { notice, type ActionHandler, type Feature } from '../../kernel/api.ts';
import type { CollectionAction } from './feature.ts';

/** Fusion keeps both parents and stores the outcome as a bead to hatch later. */
const fuse: ActionHandler<'fuse'> = (rt, action) => {
  const { ctx, save } = rt, recipe = FUSION_RECIPES.find(entry => entry.id === action.recipeId);
  if (!recipe) throw new Error('融合配方不存在。');
  if (action.primaryUid === action.secondaryUid) throw new Error('请选择两只不同的精灵作为双亲。');
  const primary = findMon(save, action.primaryUid), secondary = findMon(save, action.secondaryUid);
  if (!canFuseParents(recipe, primary, secondary)) throw new Error('双亲不符合这份融合配方，请检查精灵形态。');
  if (recipe.outcomes.filter(outcome => outcome.weight > 0).every(outcome => allowance(ctx, save, outcome.species).remaining < 1)) {
    throw new Error('本配方所有结果均已达到六份上限。');
  }
  const outcome = chooseFusionOutcome(recipe, rt.rng.next()), id = fusionBeadItemId(outcome.species), name = ctx.speciesName(outcome.species);
  const reason = capacityReason(ctx, save, outcome.species);
  if (reason) {
    notice(rt, `本次融合结果为${name}，${reason}双亲保留，可腾出额度或再次尝试。`);
    return;
  }
  save.items[id] = (save.items[id] ?? 0) + 1;
  notice(rt, `融合成功：获得${outcome.beadName}（${name}）。双亲已保留，可前往道具背包孵化。`);
  return { created: { itemId: id } };
};

const breed: ActionHandler<'breed'> = (rt, action) => {
  const { ctx, save } = rt, recipe = BREEDING_RECIPES.find(entry => entry.id === action.recipeId);
  if (!recipe) throw new Error('繁殖配方不存在。');
  const first = findMon(save, action.firstUid), second = findMon(save, action.secondUid);
  if (!canBreedParents(recipe, first, second)) throw new Error('双亲不符合配对条件：请选择两只指定成熟形态、至少50级的精灵，雄性必须为第一代。');
  // Validate every catalog outcome and the six-copy capacity before consuming the selection RNG.
  for (const outcome of recipe.outcomes) ctx.dex.species(outcome.species);
  if (recipe.outcomes.filter(outcome => outcome.weight > 0).every(outcome => allowance(ctx, save, outcome.species).remaining < 1)) {
    throw new Error('本配方所有结果均已达到六份上限。');
  }
  const outcome = chooseBreedingOutcome(recipe, rt.rng.next()), name = ctx.speciesName(outcome.species);
  const reason = capacityReason(ctx, save, outcome.species);
  if (reason) {
    notice(rt, `本次繁殖结果为${name}，${reason}双亲保留，可腾出额度或再次尝试。`);
    return;
  }
  const infant = acquire(rt, outcome.species, 1, 'breeding', 1);
  notice(rt, `繁殖孵化成功：${name} Lv.1 已加入${rt.save.party.includes(infant.uid) ? '背包' : '仓库'}。双亲已保留。`);
  return { created: { uid: infant.uid } };
};

export const collectionActions = { fuse, breed } satisfies Feature<CollectionAction>['actions'];
