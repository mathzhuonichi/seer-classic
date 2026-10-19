// Gaining monsters: storage and six-copy capacity, trait rolls and capacity-aware evolution.
import type { Rng } from '../../battle/core/src/index.ts';
import {
  addMonster, BOX_MAX, createMonster, evolve, findMon, levelEvolutions, PARTY_MAX, requiresEvolutionChoice, type Monster, type Save,
} from '../../raising/core/index.ts';
import type { GameSave } from './save.ts';
import { acquisitionAllowance, acquisitionLimitReason } from '../domain/acquisition/acquisition-limits.ts';
import type { GameContext } from './context.ts';
import { commit, notice, type Runtime } from './api.ts';

export const allowance = (ctx: GameContext, save: GameSave, species: number, excludeUid?: string) =>
  acquisitionAllowance(save, ctx.essencesBySpecies.get(species) ?? [], species, excludeUid);

/** Why one more copy of `species` cannot be held, or undefined when it can. */
export function capacityReason(ctx: GameContext, save: GameSave, species: number, excludeUid?: string): string | undefined {
  const stock = allowance(ctx, save, species, excludeUid);
  return stock.remaining < 1 ? acquisitionLimitReason(ctx.speciesName(species), stock) : undefined;
}

export const storageFull = (save: Save) => save.party.length >= PARTY_MAX && save.storage.length - save.party.length >= BOX_MAX;
/** Why no monster can be obtained while the party and the box are full; 放生 in the bag frees a place. */
export const STORAGE_FULL_REASON = '仓库已满，请先在精灵背包的「资料」页放生精灵，腾出空间。';

/** Reject before generating a monster, so a full box does not consume reward RNG. */
export function ensureAcquisitionCapacity(save: Save) {
  if (storageFull(save)) throw new Error(STORAGE_FULL_REASON);
}

export function ensureSpeciesCapacity(ctx: GameContext, save: GameSave, species: number, excludeUid?: string) {
  const reason = capacityReason(ctx, save, species, excludeUid);
  if (reason) throw new Error(reason);
}

/** Every newly obtained monster draws one implemented trait. */
export function rollTrait(ctx: GameContext, save: GameSave, rng: Rng, uid: string) {
  const traits = ctx.availableTraits;
  save.game.traits[uid] = traits[rng.int(0, traits.length - 1)].id;
}

/** Stores a new monster and rolls its trait. */
export function storeMonster(rt: Runtime, mon: Monster) {
  commit(rt, addMonster(rt.save, mon));
  rollTrait(rt.ctx, rt.save, rt.rng, mon.uid);
}

export function acquire(rt: Runtime, species: number, level = 1, how = 'quest', generation?: number): Monster {
  const { ctx } = rt;
  ensureAcquisitionCapacity(rt.save);
  ensureSpeciesCapacity(ctx, rt.save, species);
  const mon = createMonster(ctx.dex, species, level, rt.rng, { how, at: new Date().toISOString() });
  storeMonster(rt, mon);
  notice(rt, `获得精灵：${ctx.speciesName(species)}！`);
  if (generation !== undefined) findMon(rt.save, mon.uid).generation = generation;
  return mon;
}

/** Follows single automatic level evolutions while the six-copy capacity allows. */
export function boundedAutoEvolve(rt: Runtime, mon: Monster): Monster {
  const { ctx } = rt;
  let current = mon;
  for (const visited = new Set<number>(); !visited.has(current.species);) {
    visited.add(current.species);
    if (requiresEvolutionChoice(current, ctx.dex)) break;
    const options = levelEvolutions(current, ctx.dex);
    if (options.length !== 1) break;
    const reason = capacityReason(ctx, rt.save, options[0], mon.uid);
    if (reason) {
      notice(rt, `${reason}本次保留当前形态与已获得的经验，腾出额度后可手动进化。`);
      break;
    }
    current = evolve(current, options[0], ctx.dex).mon;
  }
  return current;
}
