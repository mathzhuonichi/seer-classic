// Catalogue views: encounters, their opponents and rewards, and the species collection.
import type { BossEncounter } from '../../../battle/core/src/index.ts';
import { bossEncounterForAttempt, isRegularEncounter } from '../../domain/challenges/boss-encounter.ts';
import { braveTowerFloor, braveTowerRewards, type BraveTowerRewardSource } from '../../domain/challenges/brave-tower.ts';
import { buildBossEncounterEvidence } from '../../domain/challenges/boss-evidence.ts';
import { opponentViews, towerRewardLabel } from '../../domain/challenges/encounter-rows.ts';
import { createCatalogViews } from './catalog-views.ts';
import type { BossView } from '../../shared/views.ts';
import type { CatalogContext, GameContext } from '../../kernel/api.ts';
import { portrait, typeLabel } from '../../shared/view-common.ts';

type EncounterExtras = { location?: { zh?: string }; strategy_notes?: { zh?: string } | string };


function encounterCategory(b: BossEncounter): string {
  if (b.category === 'trainer') return '训练师对战';
  if (b.name!.zh.includes('暗黑')) return '暗黑武斗场';
  if (b.category === 'tower') return '勇者之塔';
  if (b.category === 'legendary') return '传说挑战';
  return ['story', 'event'].includes(String(b.category)) ? '任务挑战' : 'SPT首领';
}

function towerRewardText(ctx: CatalogContext, boss: BossEncounter): string {
  const rewards = braveTowerRewards(boss.reward as BraveTowerRewardSource);
  return rewards.map(reward => `${reward.firstClear ? '首次通关' : '每次通关'}：${towerRewardLabel(ctx, reward.id, reward.count)}`).join('；') || '本层无额外通关道具';
}

export function encounterView(ctx: CatalogContext, source: BossEncounter, attempts = 0): Omit<BossView, 'cleared' | 'attempts'> {
  const b = bossEncounterForAttempt(source, attempts), extra = b as BossEncounter & EncounterExtras;
  const notes = (extra.strategy_notes as { zh?: string } | undefined)?.zh ?? extra.strategy_notes ?? '';
  return {
    id: b.id, category: encounterCategory(b), name: b.name?.zh ?? b.id, location: extra.location?.zh,
    description: String(notes).replace(/\[object Object\]/g, ''),
    level: b.team[0].level, species: b.team[0].species, portrait: portrait(b.team[0].species), opponents: opponentViews(ctx, b),
    evidence: buildBossEncounterEvidence(b), ...(braveTowerFloor(b.id) !== undefined ? { rewardText: towerRewardText(ctx, b) } : {}),
  };
}

/** Collection and challenge rows, reused until progress changes. */
export function catalogViews(ctx: GameContext) {
  const bossSpecies = new Set(ctx.bosses.filter(isRegularEncounter).flatMap(boss => boss.team.map(mon => mon.species)));
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
