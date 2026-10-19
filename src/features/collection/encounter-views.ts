// Catalogue views: encounters, their opponents and rewards, and the species collection.
import type { BossEncounter } from '../../../battle/core/src/index.ts';
import { bossEncounterForAttempt } from '../../domain/challenges/boss-encounter.ts';
import { interceptedFieldSpecies } from '../../domain/acquisition/native-acquisition.ts';
import { braveTowerFloor, braveTowerRewards, braveTowerUnlockFloor, type BraveTowerRewardSource } from '../../domain/challenges/brave-tower.ts';
import { buildBossEncounterEvidence } from '../../domain/challenges/boss-evidence.ts';
import { encounterCategory, opponentViews, towerRewardLabel } from '../../domain/challenges/encounter-rows.ts';
import { createCatalogViews } from './catalog-views.ts';
import type { BossView } from '../../shared/views.ts';
import type { CatalogContext, GameContext } from '../../kernel/api.ts';
import { portrait, typeLabel } from '../../shared/view-common.ts';

type EncounterExtras = { location?: { zh?: string }; strategy_notes?: { zh?: string } | string };


function towerRewardText(ctx: CatalogContext, boss: BossEncounter): string {
  const rewards = braveTowerRewards(boss.reward as BraveTowerRewardSource);
  return rewards.map(reward => `${reward.firstClear ? '首次通关' : '每次通关'}：${towerRewardLabel(ctx, reward.id, reward.count)}`).join('；') || '本层无额外通关道具';
}

type EncounterReward = { items?: Record<string, number>; learn_skill?: { skill: number } };

/** What any other won encounter pays besides the victory coins and pooled experience. */
function encounterRewardText(ctx: CatalogContext, boss: BossEncounter): string {
  const reward = boss.reward as EncounterReward | undefined, items = Object.entries(reward?.items ?? {});
  if (reward?.learn_skill) return `领悟技能：${ctx.data.skills.get(reward.learn_skill.skill)?.name.zh}`;
  if (items.some(([id]) => ctx.catalog.items.find(item => item.id === id)?.kind === 'essence')) return '获得首领精元 → 道具背包 → 确认孵化';
  if (items.length) return `获得${items.map(([id, count]) => towerRewardLabel(ctx, id, count)).join('、')}`;
  return '仅赛尔豆与积累经验，没有精元或道具';
}

export function encounterView(ctx: CatalogContext, source: BossEncounter, attempts = 0): Omit<BossView, 'cleared' | 'attempts'> {
  const b = bossEncounterForAttempt(source, attempts), extra = b as BossEncounter & EncounterExtras;
  const floor = braveTowerFloor(b.id), unlockFloor = braveTowerUnlockFloor(b);
  const notes = (extra.strategy_notes as { zh?: string } | undefined)?.zh ?? extra.strategy_notes ?? '';
  return {
    id: b.id, category: encounterCategory(b), name: b.name?.zh ?? b.id, location: extra.location?.zh,
    description: String(notes).replace(/\[object Object\]/g, ''),
    level: b.team[0].level, species: b.team[0].species, portrait: portrait(b.team[0].species), opponents: opponentViews(ctx, b),
    evidence: buildBossEncounterEvidence(b), rewardText: floor !== undefined ? towerRewardText(ctx, b) : encounterRewardText(ctx, b),
    ...(floor === undefined && unlockFloor ? { towerUnlockFloor: unlockFloor } : {}),
  };
}

/** Collection and challenge rows, reused until progress changes. */
export function catalogViews(ctx: GameContext) {
  const bossSpecies = interceptedFieldSpecies(ctx.bosses);
  const species = ctx.catalog.species.map(row => {
    const id = Number(row.id);
    return {
      id, name: (row.name as { zh: string }).zh, types: (row.types as string[]).map(typeLabel), baseStats: { ...ctx.dex.species(id).base },
      portrait: portrait(id), wildCapture: (row.obtain as string[] | undefined)?.includes('wild') && !bossSpecies.has(id),
    };
  });
  return createCatalogViews(
    species,
    ctx.encounters.map(boss => encounterView(ctx, boss)),
    (view, attempts) => ({ ...view, ...encounterView(ctx, ctx.encounterById.get(view.id)!, attempts) }),
  );
}
