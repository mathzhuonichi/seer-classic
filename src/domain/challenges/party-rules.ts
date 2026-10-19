// The player's wording of the Boss party rules: each rule as stated before the start, and the refusal when the team breaks it.
import { partyRules, type BossEncounter, type PartyRefusal, type PartyRule } from '../../../battle/core/src/index.ts';

type SpeciesName = (species: number) => string;
/** A rule on the team's size or its members' levels, worded without species names. */
type TeamRule = Exclude<PartyRule, { kind: 'species' }>;

function teamClause(rule: TeamRule): string {
  switch (rule.kind) {
    case 'team_max': return `只能派 ${rule.count} 只精灵出战`;
    case 'team_min': return `至少要派 ${rule.count} 只精灵出战`;
    case 'level_max': return `出战精灵等级不超过 ${rule.level} 级`;
    case 'level_min': return `出战精灵等级至少 ${rule.level} 级`;
  }
}

function ruleClause(rule: PartyRule, speciesName: SpeciesName): string {
  return rule.kind === 'species' ? `只能派${rule.species.map(speciesName).join('或')}出战` : teamClause(rule);
}

/** What the team has against a broken rule: its size for a team-size rule, otherwise how many members break it. */
function refusalCount(refusal: PartyRefusal): string {
  switch (refusal.kind) {
    case 'team_max': case 'team_min': return `当前队伍 ${refusal.size} 只`;
    case 'level_max': return `${refusal.slots.length} 只超过`;
    case 'level_min': return `${refusal.slots.length} 只未达到`;
    case 'species': return `${refusal.slots.length} 只不符合`;
  }
}

/** A team-size or level rule as a sentence stated before the start; campaign stages state their minimum level with it. */
export function teamRuleText(rule: TeamRule): string {
  return `${teamClause(rule)}。`;
}

/** The encounter's party rules as sentences, stated before the start. */
export function partyRuleTexts(encounter: Pick<BossEncounter, 'rules'>, speciesName: SpeciesName): string[] {
  return partyRules(encounter).map(rule => `${ruleClause(rule, speciesName)}。`);
}

/** The refusal notice for the rules the team breaks, and where to adjust it. */
export function partyRefusalText(refusals: readonly PartyRefusal[], speciesName: SpeciesName): string {
  const broken = refusals.map(refusal => `${ruleClause(refusal, speciesName)}（${refusalCount(refusal)}）`);
  return `本挑战${broken.join('；')}。请在精灵背包中调整出战精灵后再挑战。`;
}
