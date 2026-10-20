import { MATCHUP_LABELS } from '../../../shared/labels.ts';
import type { TypeMatchupView } from '../../../shared/views.ts';
import { matchupLabel, matchupRelation, multiplierText } from '../type-matchup.ts';

/**
 * The type matchup between the health panels, as the current official client shows it: in the centre how my attack fares
 * (无效, 微弱, 均衡 or 克制), and beside each side's panel the multiplier that side's types get against the other.
 */
export default function BattleMatchup({ matchup }: { matchup: TypeMatchupView }) {
  const label = matchupLabel(matchup);
  return <div className={`classic-matchup is-${matchup.relation}`} role="img" aria-label={label} title={label}>
    <span className={`classic-matchup-rate mine is-${matchupRelation(matchup.mine)}`}>{multiplierText(matchup.mine)}</span>
    <strong>{MATCHUP_LABELS[matchup.relation]}</strong>
    <span className={`classic-matchup-rate theirs is-${matchupRelation(matchup.theirs)}`}>{multiplierText(matchup.theirs)}</span>
  </div>;
}
