// Snapshot views of owned monsters, their skills and their engravings.
import { STRUGGLE_SKILL, type DataSet, type Skill as BattleSkill } from '../../../battle/core/src/index.ts';
import { attackTypes } from '../../../battle/core/src/typechart.ts';
import { computeStats, evolutionOptions, expToNext, findMon, type Monster } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/save.ts';
import { engravingAccess } from '../../domain/engravings/engraving-access.ts';
import {
  activeEngravings, engravingBlockedReason, engravingById, engravingEffectGroup, engravingStatBonus, engravingStatKeys, type EngravingDefinition,
} from '../../domain/engravings/engravings.ts';
import { engravings } from '../../domain/engravings/engravings.ts';
import { traits } from '../../domain/traits.ts';
import { getBreedingGender } from '../../domain/recipes/breeding.ts';
import { appearanceSpecies } from '../../domain/acquisition/skins.ts';
import { SKILL_CATEGORY_LABELS } from '../../shared/labels.ts';
import type { EngravingView, EvolutionChoiceView, MonsterEngravingsView, MonsterView, SkillView } from '../../kernel/contract.ts';
import { capacityReason } from '../../kernel/acquire.ts';
import type { GameContext } from '../../kernel/context.ts';
import {engravingHolder, equippedEngravingCounts, equippedEngravings} from '../engravings/index.ts';
import { portrait, typeLabel } from '../../shared/view-common.ts';

const STRUGGLE_VIEW = {
  name: STRUGGLE_SKILL.name.zh, type: '无', category: SKILL_CATEGORY_LABELS[STRUGGLE_SKILL.category],
  power: STRUGGLE_SKILL.power, pp: STRUGGLE_SKILL.pp, maxPp: STRUGGLE_SKILL.pp, description: '技能耗尽时使用。',
};

export function skillView(data: DataSet, id: number, pp?: Record<string, number>, engraved?: BattleSkill): SkillView {
  const skill = engraved ?? data.skills.get(id);
  if (!skill) return { id, ...STRUGGLE_VIEW };
  return {
    id, name: skill.name.zh, type: attackTypes(data.types, skill.type).map(typeLabel).join('·'),
    category: SKILL_CATEGORY_LABELS[skill.category as keyof typeof SKILL_CATEGORY_LABELS] ?? SKILL_CATEGORY_LABELS.status,
    power: skill.power + (skill.power_bonus ?? 0), pp: pp?.[id] ?? skill.pp, maxPp: skill.pp,
    description: String((skill as { desc?: { zh?: string } }).desc?.zh ?? ''),
  };
}

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
    return { species: edge.to, name: ctx.speciesName(edge.to), level, ready: !blockedReason, blockedReason };
  });
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
    evolutionChoices: evolutionChoices(ctx, save, mon), gender: getBreedingGender(sp.id), generation: mon.generation ?? 0,
  };
}
