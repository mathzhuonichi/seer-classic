// Action handlers that open, play and close battles.
import { Rng, type BossEncounter } from '../../../battle/core/src/index.ts';
import { createMonster, findMon } from '../../../raising/core/index.ts';
import { NPC_ONLY_SPECIES } from '../../domain/acquisition/acquisition.ts';
import { createFacilityEncounter } from '../../domain/challenges/battle-facilities.ts';
import { braveTowerFloor } from '../../domain/challenges/brave-tower.ts';
import { CHALLENGE_CAMPAIGNS } from '../../domain/challenges/challenge-campaigns.ts';
import { WORLD_PLANETS } from '../../domain/world/world.ts';
import { ensureAcquisitionCapacity, ensureSpeciesCapacity } from '../../kernel/acquire.ts';
import { DEFAULT_WILD_SPECIES, NO_STAMINA_MESSAGE, towerEncounter } from './battle-setup.ts';
import { playTurn, startBattle } from './battle-session.ts';
import { TRAINER_CAPTURE_MESSAGE } from './battle-view.ts';
import { isRegularEncounter } from '../collection/encounter-views.ts';
import { campaignProgress, stageRequirement } from '../challenges/progress-views.ts';
import { battleInProgress, notice, requireSession, type ActionHandler, type ActionHandlers, type Runtime } from '../../kernel/api.ts';


/** Recruit-only species are met at the lead's level, and never below this minimum. */
const RECRUIT_MIN_LEVEL = 5;

function rejectCampaignEncounter(rt: Runtime, bossId: string) {
  const campaign = rt.ctx.campaignForBoss(bossId);
  if (campaign) throw new Error(`请从「${campaign.name}」的阶段场景开始挑战。`);
}

function startTowerFloor(rt: Runtime, floor: number) {
  startBattle(rt, towerEncounter(rt.ctx, rt.save, floor));
  // Save the attempted floor only after the battle has successfully started.
  rt.save.game.braveTower = { ...rt.save.game.braveTower, resumeFloor: floor };
}

const startEncounter: ActionHandler<'startBattle'> = (rt, action) => {
  const boss = rt.ctx.encounters.find(entry => entry.id === action.bossId);
  if (!boss) throw new Error('挑战不存在。');
  rejectCampaignEncounter(rt, boss.id);
  const floor = braveTowerFloor(boss.id);
  if (floor !== undefined) startTowerFloor(rt, floor);
  else startBattle(rt, boss);
};

const startFacility: ActionHandler<'startFacility'> = (rt, action) => {
  if (!rt.save.party.some(uid => findMon(rt.save, uid).hp > 0)) throw new Error(NO_STAMINA_MESSAGE);
  // Prepare with a draft RNG so invalid input never advances the saved stream.
  const previous = rt.rng, draft = new Rng(rt.rng.s);
  const encounter = createFacilityEncounter(rt.ctx.catalog, action.facilityId, draft, action.teamId);
  try {
    rt.rng = draft;
    startBattle(rt, encounter);
  } catch (error) {
    rt.rng = previous;
    throw error;
  }
};

const startCampaignStage: ActionHandler<'startCampaignStage'> = (rt, action) => {
  const campaign = CHALLENGE_CAMPAIGNS.find(entry => entry.id === action.campaignId);
  const index = campaign?.stages.findIndex(entry => entry.id === action.stageId) ?? -1;
  if (!campaign || index < 0) throw new Error('挑战阶段不存在。');
  if (index > campaignProgress(rt.save, campaign).length) throw new Error('请先完成前一阶段挑战。');
  const stage = campaign.stages[index], reason = stageRequirement(rt.ctx, rt.save, stage);
  if (reason) throw new Error(reason);
  const boss = rt.ctx.bosses.find(entry => entry.id === stage.bossIds[0]);
  if (!boss) throw new Error('挑战不存在。');
  startBattle(rt, boss, { campaign: { id: campaign.id, stageId: stage.id } });
};

/** A world-map contact: the species' Boss, a wild battle, or a recruit-only field challenge for its essence. */
const startTraining: ActionHandler<'startTraining'> = (rt, action) => {
  const { ctx } = rt, species = action.species ?? DEFAULT_WILD_SPECIES, located = !!(action.planetId || action.regionId);
  const location = located ? WORLD_PLANETS.find(planet => planet.id === action.planetId)?.regions.find(region => region.id === action.regionId) : undefined;
  if (located && (!location || !location.creatures.includes(species))) throw new Error('这个地点没有该精灵的遭遇入口。');
  const collectionEntry = location ? location.recruitmentSpecies?.includes(species)
    : WORLD_PLANETS.some(planet => planet.regions.some(region => region.recruitmentSpecies?.includes(species)));
  if (collectionEntry) throw new Error(`请通过「${ctx.speciesName(species)} · 精灵招募」完成收集与挑战条件，领取精元。`);
  if (NPC_ONLY_SPECIES.has(species)) throw new Error('本作将这个剧情伙伴家族列为展示精灵，没有常规招募或捕捉路线。');
  const sp = ctx.dex.species(species);
  const encounters = ctx.bosses.filter(boss => boss.team.some(mon => mon.species === species) && isRegularEncounter(boss));
  if (encounters.length) {
    const encounter = encounters.find(boss => boss.id.startsWith('boss_spt_')) ?? encounters[0];
    rejectCampaignEncounter(rt, encounter.id);
    startBattle(rt, encounter);
  } else if ((sp as { obtain?: string[] }).obtain?.includes('wild')) {
    startBattle(rt, null, { wildSpecies: species, level: action.level });
  } else {
    const wild = createMonster(ctx.dex, species, action.level ?? Math.max(RECRUIT_MIN_LEVEL, findMon(rt.save, rt.save.party[0]).level), rt.rng);
    const recruit: BossEncounter = {
      id: `recruit-${species}`, name: { zh: `野外挑战：${sp.name.zh}` }, team: [wild], rules: [{ rule: 'no_capture' }], win: [{ kind: 'ko_all' }],
      reward: { items: { [`essence_recruit_${species}`]: 1 } },
    };
    startBattle(rt, recruit);
  }
};

export const battleActions = {
  startBattle: startEncounter,
  startTower: (rt, action) => startTowerFloor(rt, action.floor),
  enterTower: (rt, action) => {
    towerEncounter(rt.ctx, rt.save, action.floor);
    rt.save.game.braveTower = { ...rt.save.game.braveTower, resumeFloor: action.floor };
  },
  startFacility,
  startCampaignStage,
  resetCampaign: (rt, action) => {
    rt.save.game.campaigns[action.campaignId] = [];
    notice(rt, '本次阶段进度已重置，可以从第一阶段重新挑战。');
  },
  startTraining,
  move: (rt, action) => playTurn(rt, { kind: 'move', skill: action.skillId }),
  switch: (rt, action) => {
    const { battle } = requireSession(rt);
    playTurn(rt, { kind: 'switch', slot: battle.sides[0].team.findIndex(mon => mon.uid === action.uid) });
  },
  battleItem: (rt, action) => {
    const { battle } = requireSession(rt), side = battle.sides[0];
    const target = action.targetUid ? side.team.findIndex(mon => mon.uid === action.targetUid) : side.active;
    playTurn(rt, { kind: 'item', item: action.itemId, target });
  },
  capture: (rt, action) => {
    const { battle, encounter } = requireSession(rt);
    if (encounter) throw new Error(encounter.category === 'trainer' ? TRAINER_CAPTURE_MESSAGE : '首领与招募挑战不可捕捉，请使用精元或任务获取。');
    ensureAcquisitionCapacity(rt.save);
    ensureSpeciesCapacity(rt.ctx, rt.save, battle.active(1).species.id);
    playTurn(rt, { kind: 'capture', item: action.itemId });
  },
  flee: rt => playTurn(rt, { kind: 'flee' }),
  closeBattle: rt => {
    if (battleInProgress(rt)) throw new Error('请先结束战斗。');
    rt.session = null;
  },
} satisfies Partial<ActionHandlers>;
