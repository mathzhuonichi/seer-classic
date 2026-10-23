import paidSource from '../../../data/paid-spt-recruitment.json';
import { NPC_ONLY_SPECIES, type AcquisitionCatalog, type AcquisitionEncounter } from './acquisition-model.ts';
import { CHALLENGE_CAMPAIGNS } from '../challenges/challenge-campaigns.ts';

export interface RecruitmentEvidence {
  kind: string;
  sourceSpecies: number;
  productId: number;
  itemIds: string;
  name: string;
  price: number;
  currency: string;
  hatchSpecies?: number;
}
export interface PaidRecruitmentSource {
  rewardSpecies: number;
  name: string;
  evidence: readonly RecruitmentEvidence[];
}
export interface PaidSPTRecruitment extends PaidRecruitmentSource {
  questId: string;
  prerequisiteBossIds: readonly string[];
  prerequisiteSpecies: readonly number[];
}

/** Membership is explicit original client SPT table evidence, rather than an ID prefix alone. */
export const OFFICIAL_ORDINARY_SPT_SPECIES = new Set([34,42,47,50,69,88,113,132,187,216,264,274,391,421,490,538,587,617,672,715,755,804,855,925,945,957,997,1012,1045,1061,1085,1109,1131,1147,1164,1191,1221,1265,1304,1354,1377,1391,1418,1431,1453,1477]);
/** The requested divine beasts, Puni and both NPC partner families never become prerequisites or rewards. */
export function buildExcludedRecruitmentSpecies(catalog: Pick<AcquisitionCatalog,'species'>): Set<number> {
  const excluded = new Set([...NPC_ONLY_SPECIES,...CHALLENGE_CAMPAIGNS.filter(campaign => campaign.id !== 'rei-training').map(campaign => campaign.species)]);
  // Include the entire directed ancestry family, covering initial forms and future alternate forms.
  for (let pass=0;pass<catalog.species.length;pass++) {
    let changed=false;
    for (const species of catalog.species) {
      const relatives=[...(species.evolves_from?[species.evolves_from]:[]),...species.evolution.map(edge=>edge.to)];
      if(excluded.has(species.id)||relatives.some(id=>excluded.has(id)))for(const id of [species.id,...relatives])if(!excluded.has(id)){excluded.add(id);changed=true;}
    }
    if(!changed)break;
  }
  return excluded;
}
const campaignBossIds = new Set(CHALLENGE_CAMPAIGNS.flatMap(campaign => campaign.stages.flatMap(stage => stage.bossIds)));
export const PAID_RECRUITMENT_PREREQUISITE_COUNT = 5;

/** Stable one-record-per-SPT selection prevents alternate encounter variants counting twice. */
export function getEligibleRecruitmentSPTs(catalog: AcquisitionCatalog): AcquisitionEncounter[] {
  const excluded = buildExcludedRecruitmentSpecies(catalog);
  const eligible = catalog.bosses.filter(boss => boss.category === 'spt' && boss.id.startsWith('boss_spt_') && !campaignBossIds.has(boss.id)
    && boss.team.length === 1 && OFFICIAL_ORDINARY_SPT_SPECIES.has(boss.team[0].species) && !excluded.has(boss.team[0].species));
  eligible.sort((a,b) => a.team[0].species-b.team[0].species || (a.id<b.id?-1:a.id>b.id?1:0));
  // The stable final encounter ID represents a species with numbered challenge variants.
  return [...new Map(eligible.map(boss => [boss.team[0].species,boss])).values()];
}

/** Apply the authorized remake rule to evidenced initial forms, with explicit lower-number gates. */
export function buildPaidSPTRecruitments(catalog: AcquisitionCatalog, sources: readonly PaidRecruitmentSource[] = paidSource.species): PaidSPTRecruitment[] {
  const definitions = new Map(catalog.species.map(species => [species.id,species]));
  const descendants = new Set(catalog.species.flatMap(species => species.evolution.map(edge => edge.to)));
  const eligible = getEligibleRecruitmentSPTs(catalog);
  const excluded = buildExcludedRecruitmentSpecies(catalog);
  const seen = new Set<number>();
  return sources.flatMap(source => {
    const species = definitions.get(source.rewardSpecies);
    // Invalid/adult records fail closed instead of silently turning into a direct adult reward.
    if (!species || species.evolves_from && definitions.has(species.evolves_from) || descendants.has(species.id)
      || excluded.has(species.id) || seen.has(species.id) || !source.evidence.some(evidence => evidence.currency === 'diamonds' && evidence.price > 0)) return [];
    const preceding = eligible.filter(boss => boss.team[0].species < species.id).slice(-PAID_RECRUITMENT_PREREQUISITE_COUNT);
    if (!preceding.length) return [];
    seen.add(species.id);
    return [{...source,questId:`paid-spt-recruitment-${species.id}`,
      prerequisiteBossIds:preceding.map(boss => boss.id),prerequisiteSpecies:preceding.map(boss => boss.team[0].species)}];
  }).sort((a,b) => a.rewardSpecies-b.rewardSpecies);
}
