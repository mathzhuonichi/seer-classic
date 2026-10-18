// Assembling a battle from the save: encounter preparation, the player's side and the engine options.
import {
  validateEncounter, type Battle, type BattleOptions, type BossEncounter, type Hook, type MonsterInput, type Rng, type ScriptRegistry, type SideInput,
} from '../../../battle/core/src/index.ts';
import { SEER_SCRIPTS } from '../../../battle/core/src/scripts/index.ts';
import { activeBeads, computeStats, createMonster, findMon, type Monster } from '../../../raising/core/index.ts';
import type { GameSave } from '../../kernel/api.ts';
import { bossEncounterForAttempt } from '../../domain/challenges/boss-encounter.ts';
import { campaignScripts } from '../../domain/challenges/campaign-rules.ts';
import { traits } from '../../domain/traits.ts';
import { npcTrainingScripts } from '../../domain/challenges/npc-training-scripts.ts';
import { traitScripts } from '../../domain/traits.ts';
import { trainerBattleSupplies } from '../../domain/battle-supplies.ts';
import { braveTowerBossId, canStartBraveTowerFloor } from '../../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS, type CampaignStage } from '../../domain/challenges/challenge-campaigns.ts';
import { normalizeNpcTrainingEncounter } from '../../domain/challenges/npc-training.ts';
import { appearanceSpecies } from '../../domain/acquisition/skins.ts';
import type { GameContext } from '../../kernel/api.ts';
import {engravingLoadout} from '../engravings/index.ts';
import type { Appearance, CampaignContext } from '../../kernel/api.ts';

export const BATTLE_SCRIPTS: ScriptRegistry = { ...SEER_SCRIPTS, ...traitScripts, ...campaignScripts, ...npcTrainingScripts };
/** The species a wild battle meets when the request names none. */
export const DEFAULT_WILD_SPECIES = 10;
/** Wild monsters meet the lead at this fraction of its level, and never below the minimum. */
export const WILD_LEVEL_RATIO = 0.85;
export const WILD_MIN_LEVEL = 3;
const PLAYER_SIDE_NAME = '赛尔';
export const NO_STAMINA_MESSAGE = '精灵体力耗尽，请使用恢复舱。';

export const wildLevel = (leadLevel: number) => Math.max(WILD_MIN_LEVEL, Math.round(leadLevel * WILD_LEVEL_RATIO));

export interface BattleRequest {
  /** A catalogue or generated encounter; null meets a wild monster. */
  encounter: BossEncounter | null;
  wildSpecies?: number;
  level?: number;
  campaign?: CampaignContext;
}

export interface BattleSetup {
  battle: Battle;
  /** The encounter as fought: attempt level and NPC training applied. */
  encounter: BossEncounter | null;
  wild: Monster | null;
  name: string;
  appearances: Map<number, Appearance>;
  transformedSlots: Set<string>;
}

/** Builds the engine battle for a request. Draws the wild monster and the battle seed from `rng`. */
export function setupBattle(ctx: GameContext, save: GameSave, rng: Rng, request: BattleRequest): BattleSetup {
  const encounter = request.encounter && prepareEncounter(ctx, save, request.encounter);
  const roster = battleRoster(save, request.campaign && campaignStage(request.campaign));
  const supplies = trainerBattleSupplies(ctx.catalog, encounter);
  const player = playerSide(ctx, save, roster);
  if (!player.team.some(mon => mon.hp! > 0)) throw new Error(NO_STAMINA_MESSAGE);
  if (encounter) {
    const errors = validateEncounter(encounter, player);
    if (errors.length) throw new Error(errors.join('；'));
  }
  const species = request.wildSpecies ?? DEFAULT_WILD_SPECIES;
  const wild = encounter ? null : createMonster(ctx.dex, species, request.level ?? wildLevel(player.team[0].level), rng);
  const foe: SideInput = wild ? { kind: 'wild', team: [wild] }
    : { kind: encounter!.category === 'trainer' ? 'trainer' : 'boss', team: encounter!.team, unlimited_items: supplies };
  const options: BattleOptions = {
    data: ctx.data, scripts: BATTLE_SCRIPTS, seed: rng.nextU32(),
    ...(encounter?.category === 'trainer' ? { conventionalMoves: ctx.conventionalMoves() } : {}),
    sides: [player, foe], encounter: encounter ?? undefined,
  };
  const battle = ctx.createBattle(options);
  attachTraits(battle, save);
  return {
    battle, encounter, wild, name: encounter?.name?.zh ?? `野外遭遇 · ${ctx.speciesName(species)}`,
    appearances: new Map(roster.map((mon, slot) => [slot, { species: mon.species, appearanceSpecies: appearanceSpecies(mon, ctx.skinOptions) }])),
    transformedSlots: initialTransforms(battle),
  };
}

/** The encounter at this save's attempt count, with explicit NPC training applied. */
function prepareEncounter(ctx: GameContext, save: GameSave, boss: BossEncounter): BossEncounter {
  return normalizeNpcTrainingEncounter(ctx.catalog, bossEncounterForAttempt(boss, save.progress.boss_attempts[boss.id] ?? 0));
}

const campaignStage = (campaign: CampaignContext) =>
  CHALLENGE_CAMPAIGNS.find(entry => entry.id === campaign.id)!.stages.find(entry => entry.id === campaign.stageId);

/** The party in order; a stage that requires a species fields only its first qualified member. */
function battleRoster(save: GameSave, stage: CampaignStage | undefined): Monster[] {
  const roster = save.party.map(uid => findMon(save, uid));
  if (!stage?.requiredSpecies) return roster;
  return roster.filter(mon => mon.species === stage.requiredSpecies && mon.level >= (stage.minLevel ?? 1) && mon.hp > 0).slice(0, 1);
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
    slots.add(`${side}:${event.slot ?? battle.sides[side].active}`);
  }
  return slots;
}

export function towerEncounter(ctx: GameContext, save: GameSave, floor: number): BossEncounter {
  if (!canStartBraveTowerFloor(save.game.braveTower, floor)) throw new Error('此楼层尚未开放，请选择已解锁的十层起点或继续上次挑战。');
  const boss = ctx.encounters.find(entry => entry.id === braveTowerBossId(floor));
  if (!boss) throw new Error('此楼层的挑战资料暂不可用。');
  return boss;
}
