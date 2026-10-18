// A world-map contact: the species' Boss, a wild battle, or a recruit-only field challenge for its essence.
import type { BossEncounter } from '../../../battle/core/src/index.ts';
import { createMonster, findMon } from '../../../raising/core/index.ts';
import { NPC_ONLY_SPECIES } from '../../domain/acquisition/acquisition.ts';
import { isRegularEncounter } from '../../domain/challenges/boss-encounter.ts';
import { WORLD_PLANETS } from '../../domain/world/world.ts';
import type { Runtime } from '../../kernel/api.ts';
import { startSession } from '../battle/index.ts';
import { startEncounter } from '../challenges/index.ts';
import type { WorldAction } from './feature.ts';

/** The species a contact meets when the action names none. */
const DEFAULT_WILD_SPECIES = 10;
/** Recruit-only species are met at the lead's level, and never below this minimum. */
const RECRUIT_MIN_LEVEL = 5;

export function startTraining(rt: Runtime, action: WorldAction) {
  const { ctx } = rt, species = action.species ?? DEFAULT_WILD_SPECIES, located = !!(action.planetId || action.regionId);
  const location = located ? WORLD_PLANETS.find(planet => planet.id === action.planetId)?.regions.find(region => region.id === action.regionId) : undefined;
  if (located && (!location || !location.creatures.includes(species))) throw new Error('这个地点没有该精灵的遭遇入口。');
  const collectionEntry = location ? location.recruitmentSpecies?.includes(species)
    : WORLD_PLANETS.some(planet => planet.regions.some(region => region.recruitmentSpecies?.includes(species)));
  if (collectionEntry) throw new Error(`请通过「${ctx.speciesName(species)} · 精灵招募」完成收集与挑战条件，领取精元。`);
  if (NPC_ONLY_SPECIES.has(species)) throw new Error('本作将这个剧情伙伴家族列为展示精灵，没有常规招募或捕捉路线。');
  const sp = ctx.dex.species(species);
  const encounters = ctx.bosses.filter(boss => boss.team.some(mon => mon.species === species) && isRegularEncounter(boss));
  if (encounters.length) startEncounter(rt, encounters.find(boss => boss.id.startsWith('boss_spt_')) ?? encounters[0]);
  else if ((sp as { obtain?: string[] }).obtain?.includes('wild')) startSession(rt, { wild: species, level: action.level });
  else {
    const wild = createMonster(ctx.dex, species, action.level ?? Math.max(RECRUIT_MIN_LEVEL, findMon(rt.save, rt.save.party[0]).level), rt.rng);
    const recruit: BossEncounter = {
      id: `recruit-${species}`, name: { zh: `野外挑战：${sp.name.zh}` }, team: [wild], rules: [{ rule: 'no_capture' }], win: [{ kind: 'ko_all' }],
      reward: { items: { [`essence_recruit_${species}`]: 1 } },
    };
    startEncounter(rt, recruit);
  }
}
