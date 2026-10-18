// Assembling a battle from the save: encounter preparation, the player's side and the engine options.
import {
  validateEncounter, type Battle, type BattleOptions, type BossEncounter, type Hook, type MonsterInput, type Rng, type ScriptRegistry, type SideInput,
} from '../../../battle/core/src/index.ts';
import { SEER_SCRIPTS } from '../../../battle/core/src/scripts/index.ts';
import { activeBeads, computeStats, createMonster, type Monster } from '../../../raising/core/index.ts';
import type { Appearance, GameContext, GameSave } from '../../kernel/api.ts';
import { bossEncounterForAttempt } from '../../domain/challenges/boss-encounter.ts';
import { campaignScripts } from '../../domain/challenges/campaign-rules.ts';
import { npcTrainingScripts } from '../../domain/challenges/npc-training-scripts.ts';
import { traits, traitScripts } from '../../domain/traits.ts';
import { trainerBattleSupplies } from '../../domain/battle-supplies.ts';
import { normalizeNpcTrainingEncounter } from '../../domain/challenges/npc-training.ts';
import { appearanceSpecies } from '../../domain/acquisition/skins.ts';
import {engravingLoadout} from '../engravings/index.ts';

const BATTLE_SCRIPTS: ScriptRegistry = { ...SEER_SCRIPTS, ...traitScripts, ...campaignScripts, ...npcTrainingScripts };
/** Wild monsters meet the lead at this fraction of its level, and never below the minimum. */
const WILD_LEVEL_RATIO = 0.85;
const WILD_MIN_LEVEL = 3;
const PLAYER_SIDE_NAME = '赛尔';
export const NO_STAMINA_MESSAGE = '精灵体力耗尽，请使用恢复舱。';

const wildLevel = (leadLevel: number) => Math.max(WILD_MIN_LEVEL, Math.round(leadLevel * WILD_LEVEL_RATIO));

/** A catalogue or generated encounter, or a wild monster of species `wild`, by default met at a level from the lead's. */
export type Foe = { encounter: BossEncounter } | { wild: number; level?: number };

export interface BattleSetup {
  battle: Battle;
  /** The encounter as fought: attempt level and NPC training applied. */
  encounter: BossEncounter | null;
  wild: Monster | null;
  name: string;
  appearances: Map<number, Appearance>;
  transformedSlots: Set<string>;
}

/** Builds the engine battle of `roster` against `foe`. Draws the wild monster and the battle seed from `rng`. */
export function setupBattle(ctx: GameContext, save: GameSave, rng: Rng, foe: Foe, roster: Monster[]): BattleSetup {
  const encounter = 'encounter' in foe ? prepareEncounter(ctx, save, foe.encounter) : null;
  const supplies = trainerBattleSupplies(ctx.catalog, encounter);
  const player = playerSide(ctx, save, roster);
  if (!player.team.some(mon => mon.hp! > 0)) throw new Error(NO_STAMINA_MESSAGE);
  if (encounter) {
    const errors = validateEncounter(encounter, player);
    if (errors.length) throw new Error(errors.join('；'));
  }
  const wild = 'wild' in foe ? createMonster(ctx.dex, foe.wild, foe.level ?? wildLevel(player.team[0].level), rng) : null;
  const opponent: SideInput = wild ? { kind: 'wild', team: [wild] }
    : { kind: encounter!.category === 'trainer' ? 'trainer' : 'boss', team: encounter!.team, unlimited_items: supplies };
  const options: BattleOptions = {
    data: ctx.data, scripts: BATTLE_SCRIPTS, seed: rng.nextU32(),
    ...(encounter?.category === 'trainer' ? { conventionalMoves: ctx.conventionalMoves() } : {}),
    sides: [player, opponent], encounter: encounter ?? undefined,
  };
  const battle = ctx.createBattle(options);
  attachTraits(battle, save);
  return {
    battle, encounter, wild, name: wild ? `野外遭遇 · ${ctx.speciesName(wild.species)}` : encounter!.name?.zh ?? encounter!.id,
    appearances: new Map(roster.map((mon, slot) => [slot, { species: mon.species, appearanceSpecies: appearanceSpecies(mon, ctx.skinOptions) }])),
    transformedSlots: initialTransforms(battle),
  };
}

/** The encounter at this save's attempt count, with explicit NPC training applied. */
function prepareEncounter(ctx: GameContext, save: GameSave, boss: BossEncounter): BossEncounter {
  return normalizeNpcTrainingEncounter(ctx.catalog, bossEncounterForAttempt(boss, save.progress.boss_attempts[boss.id] ?? 0));
}

/** Saved HP/PP plus the unspent part of each engraving bonus, with active energy beads. */
function playerMonster(ctx: GameContext, save: GameSave, mon: Monster): MonsterInput {
  const engraving = engravingLoadout(save, ctx.data, mon), stats = { ...computeStats(mon, ctx.dex) }, pp = { ...mon.pp };
  for (const [key, value] of Object.entries(engraving.bonus)) stats[key as keyof typeof stats] += value;
  for (const [id, extra] of Object.entries(engraving.ppBonus)) {
    if (mon.skills.includes(Number(id))) pp[id] = (pp[id] ?? ctx.data.skills.get(Number(id))!.pp) + Math.max(0, extra - (engraving.deficit.pp[id] ?? 0));
  }
  const hp = mon.hp > 0 ? mon.hp + Math.max(0, engraving.hpBonus - engraving.deficit.hp) : 0;
  return { ...mon, stats, hp, pp, skill_overrides: engraving.overrides, beads: activeBeads(save, mon.uid) };
}

function playerSide(ctx: GameContext, save: GameSave, roster: Monster[]): SideInput {
  return {
    kind: 'player', name: PLAYER_SIDE_NAME, team: roster.map(mon => playerMonster(ctx, save, mon)),
    items: save.items, unlimited_items: [...ctx.unlimitedItemIds],
  };
}

/**
 * Traits act as permanent buffs. They join after construction, so the opening switch-in does not
 * fire them; MonsterInput has no condition field that would keep that timing.
 */
function attachTraits(battle: Battle, save: GameSave) {
  for (const mon of battle.sides[0].team) {
    const trait = traits.find(entry => entry.id === save.game.traits[mon.uid!]);
    if (!trait) continue;
    const id = `trait-${trait.id}`;
    mon.conditions.push({
      id, def: { id, name: { zh: trait.name }, kind: 'buff', removed_on_switch: false, hooks: trait.hooks as Hook[] }, turns: Infinity, appliedTurn: 0,
    });
  }
}

function initialTransforms(battle: Battle): Set<string> {
  const slots = new Set<string>();
  for (const event of battle.initialEvents) {
    if (event.type !== 'transform') continue;
    const side = event.side === 1 ? 1 : 0;
    slots.add(`${side}:${battle.sides[side].active}`);
  }
  return slots;
}
