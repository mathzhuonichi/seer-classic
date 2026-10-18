import bundle from '../../data/gamedata.json';
import {buildInitialFormAcquisitionIndex} from './initial-acquisition.ts';
import {getEligibleRecruitmentSPTs} from './spt-recruitment.ts';
import {braveTowerFloor} from './brave-tower.ts';
import {buildRecruitmentRewards,MAX_RECRUITMENT_PREREQUISITES,type RecruitmentPrerequisite} from './recruitment.ts';
import {NIAO_CAPTURE_PARTNERS} from '../../battle/core/src/capture.ts';
import { WORLD_PLANETS, type WorldPlanet } from '../world.ts';
import { CHALLENGE_CAMPAIGNS } from './challenge-campaigns.ts';
import { FUSION_RECIPES, type FusionRecipe } from './fusion.ts';
import { BREEDING_RECIPES, getBreedingGender, type BreedingRecipe } from './breeding.ts';

/** The user's collection scope excludes both complete NPC-partner families. */
export const NPC_ONLY_SPECIES = new Set([122, 123, 124, 125]);
export interface AcquisitionRoute {
  kind: 'starter' | 'wild' | 'boss' | 'campaign' | 'quest' | 'fusion' | 'breeding' | 'evolution';
  label: string;
  /** The obtainable seed form, including when this route leads to an evolution. */
  entrySpecies: number;
  planetId?: string;
  regionId?: string;
  bossId?: string;
  campaignId?: string;
  questId?: string;
  /** Preserved on every evolution descended from a fusion bead. */
  fusionRecipeId?: string;
  /** Breeding offspring and their evolved forms remain second-generation. */
  breedingRecipeId?: string;
  /** One of these reachable forms must be active when attempting this capture. */
  requiredActiveSpecies?: readonly number[];
  sourceSpecies?: number;
  evolutionChain?: { from: number; to: number; level: number }[];
  authoredReward?: boolean;
}
export interface AcquisitionSeed { species:number; route:AcquisitionRoute; prerequisites?:readonly RecruitmentPrerequisite[] }
export interface SpeciesAcquisition {
  status: 'available' | 'npc' | 'unimplemented';
  description: string;
  routes: AcquisitionRoute[];
}
export interface AcquisitionFamily {
  id: number;
  name: string;
  memberIds: number[];
  rootSpecies: number[];
  availableSpecies: number[];
  missingSpecies: number[];
  excludedSpecies: number[];
  status: 'complete' | 'partial' | 'missing' | 'npc';
  /** Existing acquisition actions only; grouping never creates an evolution. */
  entryRoutes: AcquisitionRoute[];
}
interface AcquisitionSpecies {
  id: number; name: { zh: string }; types?: readonly string[]; obtain?: string[]; catch_rate?: number;
  evolves_from?: number | null;
  evolution: { to: number; method: string; level?: number; automatic?: boolean }[];
}
export interface AcquisitionEncounter {
  id: string; name?: { zh: string }; category?: string; team: { species: number }[];
  reward_hatches?: number;
  reward?: { items?: Record<string, number>; monster?: { species: number; level?: number }; learn_skill?: unknown };
}
export interface AcquisitionCatalog {
  species: AcquisitionSpecies[];
  bosses: AcquisitionEncounter[];
  items?: { id: string; kind?: string; hatches?: number }[];
}

/** Original infant reward bindings take precedence over the defeated final form. */
export function resolveEncounterEssenceSpecies(boss: AcquisitionEncounter): number {
  return boss.reward_hatches ?? boss.reward?.monster?.species ?? boss.team.at(-1)!.species;
}

/** Omitting additionalSeeds enables gated recruitment; an explicit array replaces it. */
export function buildAcquisitionIndex(catalog: AcquisitionCatalog, planets: WorldPlanet[] = WORLD_PLANETS, recipes: readonly FusionRecipe[] = FUSION_RECIPES, additionalSeeds?: readonly AcquisitionSeed[], breedingRecipes: readonly BreedingRecipe[] = BREEDING_RECIPES): Map<number, SpeciesAcquisition> {
  const index = new Map<number, SpeciesAcquisition>();
  const definitions = new Map(catalog.species.map(species => [species.id, species]));
  const recruitment = additionalSeeds === undefined ? buildRecruitmentRewards(catalog, planets) : [];
  const eligibleBosses = new Map(getEligibleRecruitmentSPTs(catalog)
    .filter(boss => boss.team.every(mon => definitions.has(mon.species)))
    .map(boss => [boss.id, boss]));
  const gatedSeeds: AcquisitionSeed[] = (additionalSeeds ?? []).filter(seed => seed.prerequisites !== undefined);
  for (const reward of recruitment) {
    const requirements = reward.prerequisites.map(condition => condition.kind === 'species'
      ? `收集${definitions.get(condition.species)?.name.zh ?? condition.species}`
      : `击败${eligibleBosses.get(condition.bossId)?.name?.zh ?? condition.bossId}`);
    gatedSeeds.push({ species: reward.rewardSpecies, prerequisites: reward.prerequisites,
      route: { kind: 'quest', entrySpecies: reward.rewardSpecies, questId: reward.questId,
        label: `精灵招募：${requirements.join('、')} → 领取${reward.name}精元并孵化` } });
  }
  const conditionalCaptures: AcquisitionSeed[] = [];
  for (const species of catalog.species) index.set(species.id, {
    status: NPC_ONLY_SPECIES.has(species.id) ? 'npc' : 'unimplemented',
    description: NPC_ONLY_SPECIES.has(species.id) ? '本作将这个剧情伙伴家族列为展示精灵，不计入常规收集目标。' : '当前版本尚未实现这只精灵的获取路线。',
    routes: [],
  });
  function add(id: number, route: AcquisitionRoute) {
    const entry = index.get(id);
    if (!entry || entry.status === 'npc') return;
    entry.status = 'available';
    entry.description = '通过已实现的野外、任务、挑战、融合、繁殖或进化路线获得。';
    entry.routes.push(route);
  }
  for (const id of [1, 4, 7]) add(id, { kind: 'starter', entrySpecies: id, label: '新旅程开始时赠送 Lv.5 初始伙伴' });
  for (const [id, questId, label] of [
    [10, 'first-victory', '船长任务「初次胜利」：赢得一场战斗后领取皮皮'],
    [13, 'three-victories', '船长任务「成长之路」：赢得三场战斗后领取比比鼠'],
    [6, 'first-spt', '船长任务「SPT 挑战者」：完成一次首领挑战后领取巴鲁斯'],
  ] as const) add(id, { kind: 'quest', entrySpecies: id, questId, label });

  for (const planet of planets) for (const region of planet.regions) for (const id of region.creatures) {
    const species = definitions.get(id);
    // The controller redirects a catalog target that appears in a named boss team.
    const intercepted = catalog.bosses.some(boss => boss.team.some(mon => mon.species === id) && !boss.id.includes('tower') && !boss.id.includes('dark_door'));
    const [low, high] = region.creatureLevels?.[id] ?? region.levels;
    // A source Foundin marker can be a collection-task location rather than an
    // executable encounter. Keep this gate even when generated tasks are disabled.
    if (!species || intercepted || region.recruitmentSpecies?.includes(id)) continue;
    if (species.obtain?.includes('wild') && (species.catch_rate ?? 0) > 0) {
      const route: AcquisitionRoute = {
        kind: 'wild', entrySpecies: id, planetId: planet.id, regionId: region.id,
        label: `${region.name}：与 Lv.${low}–${high} 的${species.name.zh}对战，使用胶囊捕捉`,
      };
      if (id === 416) {
        route.requiredActiveSpecies = NIAO_CAPTURE_PARTNERS;
        route.label += `（需先获得并派出${NIAO_CAPTURE_PARTNERS.map(partner => definitions.get(partner)?.name.zh ?? `#${partner}`).join(' / ')}中的任一形态）`;
        conditionalCaptures.push({ species: id, route });
      } else add(id, route);
    }
    // Non-capturable field species use the controller's challenge-for-essence battle.
    else if (region.creatureLevels?.[id]) add(id, {
      kind: 'wild', entrySpecies: id, planetId: planet.id, regionId: region.id,
      label: `${region.name}：挑战 Lv.${low}–${high} 的${species.name.zh}，胜利后获得精元并孵化`,
    });
  }
  // Match the controller's essence registry, including shared item IDs.
  const bindings = new Map((catalog.items ?? []).filter(item => item.kind === 'essence' && item.hatches !== undefined).map(item => [item.id, item.hatches!]));
  for (const boss of catalog.bosses) {
    const campaign = CHALLENGE_CAMPAIGNS.find(candidate => candidate.stages.some(stage => stage.bossIds.includes(boss.id)));
    const intermediate = !!campaign && !campaign.stages.at(-1)!.bossIds.includes(boss.id);
    const explicit = Object.keys(boss.reward?.items ?? {}).filter(id => id.startsWith('essence_'));
    const itemIds = explicit.length ? explicit : !intermediate && !boss.reward?.learn_skill && boss.id !== 'boss_tower_brave_mystery' && braveTowerFloor(boss.id)===undefined ? [`essence_${boss.id}`] : [];
    for (const itemId of itemIds) {
      if (!bindings.has(itemId)) bindings.set(itemId, resolveEncounterEssenceSpecies(boss));
      const id = bindings.get(itemId)!;
      add(id, {
        kind: campaign ? 'campaign' : 'boss', entrySpecies: id,
        ...(campaign ? { campaignId: campaign.id } : { bossId: boss.id }),
        authoredReward: explicit.length === 0,
        label: campaign ? `完成「${campaign.name}」全部阶段 → 道具背包孵化精元` : `通过「${boss.name?.zh ?? boss.id}」挑战 → 道具背包孵化${definitions.get(id)?.name.zh ?? id}精元${explicit.length ? '' : '（本作挑战奖励）'}`,
      });
    }
  }
  for(const seed of additionalSeeds??[])if(seed.prerequisites===undefined)add(seed.species,seed.route);
  // Recruitment, conditional capture, fusion, breeding and evolution share a
  // fixed point. An unavailable prerequisite never grants its dependent reward.
  // Labels depend on the recipe/output, not every combination of parent routes.
  // This bounds the graph and keeps alternate parent acquisition paths readable.
  for (let pass = 0; pass < catalog.species.length; pass++) {
    let added = false;
    for (const seed of conditionalCaptures) {
      if (!seed.route.requiredActiveSpecies!.some(id => index.get(id)?.status === 'available')
        || index.get(seed.species)?.routes.some(route => route.label === seed.route.label)) continue;
      add(seed.species, seed.route); added = true;
    }
    for (const seed of gatedSeeds) {
      if (!index.has(seed.species) || NPC_ONLY_SPECIES.has(seed.species)
        || !seed.prerequisites!.length || seed.prerequisites!.length > MAX_RECRUITMENT_PREREQUISITES
        || !seed.prerequisites!.every(condition => condition.kind === 'species'
          ? index.get(condition.species)?.status === 'available' : eligibleBosses.has(condition.bossId))
        || index.get(seed.species)!.routes.some(route => route.label === seed.route.label)) continue;
      add(seed.species, seed.route);
      added = true;
    }
    for (const recipe of breedingRecipes) {
      if (recipe.minLevel > 100) continue;
      // The original client requires a first-generation male; female generation is unrestricted.
      const firstGeneration = (id: number) => index.get(id)?.routes.some(route => !route.breedingRecipeId);
      const male = recipe.maleSpecies.filter(id => getBreedingGender(id) === 1 && firstGeneration(id));
      const female = recipe.femaleSpecies.filter(id => getBreedingGender(id) === 2 && index.get(id)?.status === 'available');
      if (!male.length || !female.length) continue;
      for (const outcome of recipe.outcomes) {
        const target = index.get(outcome.species);
        if (outcome.weight <= 0 || !target || target.status === 'npc' || target.routes.some(route => route.kind === 'breeding' && route.breedingRecipeId === recipe.id)) continue;
        add(outcome.species, { kind: 'breeding', entrySpecies: outcome.species, breedingRecipeId: recipe.id,
          label: `精灵繁殖「${recipe.name}」：${male.map(id => definitions.get(id)!.name.zh).join(' / ')}（第一代雄性） + ${female.map(id => definitions.get(id)!.name.zh).join(' / ')}（雌性），均达到 Lv.${recipe.minLevel} → 立即随机获得${definitions.get(outcome.species)!.name.zh}（${outcome.weight}%）` });
        added = true;
      }
    }
    for (const recipe of recipes) {
      if (recipe.minPrimaryLevel > 100 || recipe.minSecondaryLevel > 100) continue;
      const primary = recipe.primary.filter(id => index.get(id)?.status === 'available');
      const secondary = recipe.secondary.filter(id => index.get(id)?.status === 'available');
      if (!primary.length || !secondary.length) continue;
      const parents = `${primary.map(id => definitions.get(id)!.name.zh).join(' / ')}（主） + ${secondary.map(id => definitions.get(id)!.name.zh).join(' / ')}（副）`;
      for (const outcome of recipe.outcomes) {
        if (outcome.weight <= 0) continue;
        const target = index.get(outcome.species);
        if (!target || target.status === 'npc' || target.routes.some(route => route.fusionRecipeId === recipe.id && route.kind === 'fusion')) continue;
        add(outcome.species, { kind: 'fusion', entrySpecies: outcome.species, fusionRecipeId: recipe.id,
          label: `精灵融合「${recipe.name}」：${parents} → ${outcome.beadName} → 道具背包立即孵化${definitions.get(outcome.species)!.name.zh}${outcome.weight < 100 ? `（${Number(outcome.weight.toFixed(2))}%）` : ''}` });
        added = true;
      }
    }
    // Only executable forward level evolutions extend an obtainable form.
    for (const species of catalog.species) for (const evolution of species.evolution) {
      if (evolution.method !== 'level' || evolution.level === undefined || evolution.level > 100) continue;
      const previous = index.get(species.id)!;
      const target = index.get(evolution.to);
      if (!target || target.status === 'npc') continue;
      for (const route of [...previous.routes]) {
        const chain = [...(route.evolutionChain ?? []), { from: species.id, to: evolution.to, level: evolution.level }];
        if (chain.some(step => step.from === evolution.to)) continue;
        const label = `${route.label} → ${species.name.zh} Lv.${evolution.level}${evolution.automatic === false ? ' 在精灵养成中确认' : ''}进化为${definitions.get(evolution.to)!.name.zh}`;
        if (target.routes.some(existing => existing.label === label)) continue;
        add(evolution.to, { ...route, kind: 'evolution', sourceSpecies: species.id, evolutionChain: chain, label });
        added = true;
      }
    }
    if (!added) break;
  }
  return index;
}

/** Source-defined ancestry groups forms; only executable rules grant coverage. */
export function buildAcquisitionFamilies(catalog: AcquisitionCatalog, index = buildAcquisitionIndex(catalog)): AcquisitionFamily[] {
  const definitions = new Map(catalog.species.map(species => [species.id, species]));
  const parents = new Map(catalog.species.map(species => [species.id, species.id]));
  function root(id: number): number {
    const parent = parents.get(id)!;
    if (parent === id) return id;
    const result = root(parent); parents.set(id, result); return result;
  }
  function union(from: number, to: number) {
    if (parents.has(from) && parents.has(to)) parents.set(root(to), root(from));
  }
  for (const species of catalog.species) {
    if (species.evolves_from) union(species.evolves_from, species.id);
    for (const evolution of species.evolution) union(species.id, evolution.to);
  }
  const groups = new Map<number, number[]>();
  for (const species of catalog.species) { const key = root(species.id); groups.set(key, [...(groups.get(key) ?? []), species.id]); }
  return [...groups.values()].map(memberIds => {
    memberIds.sort((a, b) => a - b);
    const availableSpecies = memberIds.filter(id => index.get(id)?.status === 'available');
    const missingSpecies = memberIds.filter(id => index.get(id)?.status === 'unimplemented');
    const excludedSpecies = memberIds.filter(id => index.get(id)?.status === 'npc');
    const rootSpecies = memberIds.filter(id => !memberIds.includes(definitions.get(id)!.evolves_from ?? -1) && !catalog.species.some(species => memberIds.includes(species.id) && species.evolution.some(evolution => evolution.to === id)));
    const routes = memberIds.flatMap(id => index.get(id)?.routes.filter(route => route.kind !== 'evolution') ?? []);
    const entryRoutes = [...new Map(routes.map(route => [route.label, route])).values()];
    return { id: memberIds[0], name: definitions.get(rootSpecies[0] ?? memberIds[0])!.name.zh, memberIds, rootSpecies,
      availableSpecies, missingSpecies, excludedSpecies,
      status: availableSpecies.length ? missingSpecies.length ? 'partial' : 'complete' : missingSpecies.length ? 'missing' : 'npc', entryRoutes } as AcquisitionFamily;
  }).sort((a, b) => a.id - b.id);
}

const encounters = import.meta.glob('../../data/bosses/*.json', { import: 'default', eager: true });
const acquisitionCatalog = { ...bundle, bosses: Object.values(encounters) } as unknown as AcquisitionCatalog;
const acquisitionIndex = buildAcquisitionIndex(acquisitionCatalog);
const acquisitionFamilies = buildAcquisitionFamilies(acquisitionCatalog, acquisitionIndex);
const initialFormAcquisition = buildInitialFormAcquisitionIndex(acquisitionCatalog, acquisitionIndex);
const familyBySpecies = new Map(acquisitionFamilies.flatMap(family => family.memberIds.map(id => [id, family] as const)));
export function getSpeciesAcquisition(id: number): SpeciesAcquisition {
  return acquisitionIndex.get(id) ?? { status: 'unimplemented', description: '当前版本没有这只精灵的获取记录。', routes: [] };
}
export function getAcquisitionFamily(id: number): AcquisitionFamily | undefined { return familyBySpecies.get(id); }
export function getAcquisitionFamilies(): readonly AcquisitionFamily[] { return acquisitionFamilies; }

export function getInitialFormAcquisition(id:number) { return initialFormAcquisition.get(id); }
