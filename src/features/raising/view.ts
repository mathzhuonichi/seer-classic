// Snapshot views of owned monsters, their skills and their engravings.
import { computeStats, evolutionOptions, expToNext, findMon, type Monster } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/api.ts';
import { engravingAccess } from '../../domain/engravings/engraving-access.ts';
import {
  activeEngravings, engravingBlockedReason, engravingById, engravingEffectGroup, engravingStatBonus, engravingStatKeys, type EngravingDefinition,
} from '../../domain/engravings/engravings.ts';
import { engravings } from '../../domain/engravings/engravings.ts';
import { traits } from '../../domain/traits.ts';
import { getBreedingGender } from '../../domain/recipes/breeding.ts';
import { appearanceSpecies } from '../../domain/acquisition/skins.ts';
import type { BoostView, EngravingView, EvolutionChoiceView, MonsterEngravingsView, MonsterView } from '../../shared/views.ts';
import { capacityReason } from '../../kernel/acquire.ts';
import type { GameContext } from '../../kernel/api.ts';
import {engravingHolder, equippedEngravingCounts, equippedEngravings} from '../engravings/index.ts';
import { portrait, skillView, typeLabel } from '../../shared/view-common.ts';

export function engravingView(
  ctx: GameContext, save: GameSave, def: EngravingDefinition, mon: Monster, equipped = equippedEngravingCounts(save),
): EngravingView {
  const reason = engravingBlockedReason(def, engravingHolder(mon));
  const moveName = def.moveIds?.map(id => ctx.data.skills.get(id)?.name.zh).filter(Boolean).join('、');
  const holders = save.storage.filter(holder => equippedEngravings(save, holder.uid).includes(def.id));
  return {
    id: def.id, name: def.name.zh, slot: def.slot, effect: def.effect.desc, levelMin: def.levelMin, bound: def.species.length > 0,
    moveName: moveName || undefined, moveIds: def.moveIds,
    group: engravingEffectGroup(def), statKeys: engravingStatKeys(def), era: def.era, ready: !reason, reason, note: def.notes?.join(' '),
    ...engravingAccess(def), stock: save.game.engravingStock[def.id] ?? 0, equipped: equipped[def.id] ?? 0,
    equippedHere: equippedEngravings(save, mon.uid).includes(def.id),
    equippedHolders: holders.map(holder => ({ uid: holder.uid, name: holder.nickname || ctx.speciesName(holder.species) })),
  };
}

function monsterEngravings(ctx: GameContext, save: GameSave, mon: Monster): MonsterEngravingsView {
  const ids = equippedEngravings(save, mon.uid);
  const pick = (slot: EngravingDefinition['slot']) => {
    const def = ids.map(engravingById).find(entry => entry?.slot === slot);
    return def ? engravingView(ctx, save, def, mon) : null;
  };
  return { ability: pick('ability'), skill: pick('skill'), bonus: engravingStatBonus(activeEngravings(ids, engravingHolder(mon))) };
}

/** Engravings this monster's species and known skills qualify for. */
export function engravingOptions(ctx: GameContext, save: GameSave, uid: string): EngravingView[] {
  const mon = findMon(save, uid), known = new Set([...mon.skills, ...mon.learned]), equipped = equippedEngravingCounts(save);
  return engravings
    .filter(def => (!def.species.length || def.species.includes(mon.species)) && (def.slot === 'ability' || def.moveIds!.some(id => known.has(id))))
    .map(def => engravingView(ctx, save, def, mon, equipped));
}

function evolutionChoices(ctx: GameContext, save: GameSave, mon: Monster): EvolutionChoiceView[] {
  return ctx.dex.species(mon.species).evolution.filter(edge => edge.method === 'level' && edge.level !== undefined).map(edge => {
    const level = edge.level!;
    const blockedReason = mon.level < level ? `达到 Lv.${level} 后可进化。` : capacityReason(ctx, save, edge.to, mon.uid);
    return { species: edge.to, name: ctx.speciesName(edge.to), level, blockedReason };
  });
}

/** The player-wide EXP and 学习力 boosts, and this monster's energy bead. */
function activeBoosts(ctx: GameContext, save: GameSave, mon: Monster): BoostView[] {
  return (save.boosts ?? []).filter(boost => boost.kind !== 'energy_bead' || boost.uid === mon.uid).map(boost => ({
    name: (ctx.catalog.items.find(item => item.id === boost.item)?.name as { zh?: string } | undefined)?.zh ?? boost.item, battlesLeft: boost.battles_left,
  }));
}

export function monsterView(ctx: GameContext, save: GameSave, mon: Monster): MonsterView {
  const { dex, data } = ctx;
  const sp = dex.species(mon.species), trait = traits.find(entry => entry.id === save.game.traits[mon.uid]);
  const appearance = appearanceSpecies(mon, ctx.skinOptions);
  const evolutions = evolutionOptions(mon, dex);
  return {
    uid: mon.uid, species: sp.id, appearanceSpecies: appearance,
    skinOptions: (ctx.skinOptions.get(sp.id) ?? [sp.id]).map(species => ({ species, name: ctx.speciesName(species) })),
    name: mon.nickname || sp.name.zh, speciesName: sp.name.zh, level: mon.level, exp: mon.exp, expToNext: expToNext(sp.growth, mon.level),
    iv: mon.iv, nature: dex.nature(mon.nature).name.zh, natureId: mon.nature, types: sp.types.map(typeLabel), baseStats: { ...sp.base },
    stats: computeStats(mon, dex), evs: mon.evs, hp: mon.hp,
    skills: mon.skills.map(id => skillView(data, id, mon.pp)), learned: mon.learned.map(id => skillView(data, id, mon.pp)),
    trait: trait?.name ?? '无', traitId: trait?.id ?? null, engravings: monsterEngravings(ctx, save, mon), inParty: save.party.includes(mon.uid),
    portrait: portrait(appearance), evolution: evolutions.length ? evolutions.map(id => ctx.speciesName(id)).join(' / ') : null,
    evolutionChoices: evolutionChoices(ctx, save, mon), gender: getBreedingGender(sp.id), generation: mon.generation ?? 0, boosts: activeBoosts(ctx, save, mon),
  };
}
