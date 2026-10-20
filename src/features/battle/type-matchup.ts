// The type matchup between the two monsters on screen, rated with the engine's own rule.
import { effectiveness } from '../../../battle/core/src/typechart.ts';
import type { TypeData } from '../../../battle/core/src/types.ts';
import type { BattleMonsterView, TypeMatchupView } from '../../shared/views.ts';
import { MATCHUP_LABELS, type MatchupRelation } from '../../shared/labels.ts';

type Typed = Pick<BattleMonsterView, 'typeIds'>;

export const matchupRelation = (multiplier: number): MatchupRelation =>
  multiplier === 0 ? 'immune' : multiplier < 1 ? 'weak' : multiplier === 1 ? 'neutral' : 'strong';

/** Each side's monster attacks with all of its types, as a dual-type skill does (battle/RULES.md section 6). */
export function typeMatchup(chart: TypeData, player: Typed, enemy: Typed): TypeMatchupView {
  const mine = effectiveness(chart, player.typeIds, enemy.typeIds), theirs = effectiveness(chart, enemy.typeIds, player.typeIds);
  return { relation: matchupRelation(mine), mine, theirs };
}

/**
 * The multiplier as the indicator prints it. Dual-type averages are multiples of 1/16, so four decimals are exact; rounding to
 * them only drops floating-point noise, and the number's own text drops trailing zeros.
 */
export const multiplierText = (multiplier: number) => `×${Number(multiplier.toFixed(4))}`;

/** The indicator's spoken text. */
export const matchupLabel = ({ relation, mine, theirs }: TypeMatchupView) =>
  `属性相克：我方对对方${MATCHUP_LABELS[relation]}，我方 ${multiplierText(mine)}，对方 ${multiplierText(theirs)}`;
