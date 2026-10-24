import type { BattleMonsterView } from '../../../shared/views.ts';
import { creatureArtStyle, getCreatureArt } from '../../../shared/creature-art.ts';
import { encounterLevel } from '../../../shared/encounter-level.ts';
import { appearanceOf } from '../../../shared/monster-views.ts';
import { conditionSummary, stageChips } from '../battle-hud.ts';
import { hpPercent } from '../../../shared/view-helpers.ts';
import BattleTeamStrip from './BattleTeamStrip.tsx';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';

/** One side's health panel: portrait, type, level, HP bar, conditions and team strip; `acting`: its creature is acting its move. */
export default function BattleHealth({ monster, team, enemy, acting }: {
  monster: BattleMonsterView; team: BattleMonsterView[]; enemy?: boolean; acting: boolean;
}) {
  const appearance = appearanceOf(monster);
  const summary = conditionSummary(monster);
  const level = encounterLevel(monster.level, monster.levelMasked);
  const portraitStyle = creatureArtStyle(appearance, undefined, { scaleByStage: false, fill: .9, verticalAlign: 'center' });
  return <section className={`classic-health ${enemy ? 'foe' : 'ally'}`} aria-label={`${enemy ? '对手' : '我方'}${monster.name}体力`}>
    <div className="classic-health-portrait"><img src={getCreatureArt(appearance).src} style={portraitStyle} alt="" draggable={false}/></div>
    <div className="classic-health-type"><TypeIcon type={monster.types}/></div>
    <div className="classic-health-heading"><strong title={monster.name}>{monster.name}</strong></div>
    <span className="classic-health-level" aria-label={`等级 ${level}`}>{level}</span>
    <div className="classic-hp-track" role="progressbar" aria-valuenow={monster.hp} aria-valuemin={0} aria-valuemax={monster.maxHp} aria-label="体力">
      <i style={{ width: `${hpPercent(monster.hp, monster.maxHp)}%` }} />{!monster.hpHidden && <span>{monster.hp} / {monster.maxHp}</span>}
    </div>
    <div className="classic-health-footer">
      <div className="classic-conditions" title={summary} aria-label={summary}>
        {monster.statuses.map(status => <span key={status} className="condition">{status}</span>)}
        {stageChips(monster.stages).map(chip => <span key={chip.stat} className={chip.value > 0 ? 'stage-up' : 'stage-down'}>
          {chip.label}{chip.value > 0 ? '↑' : '↓'}{Math.abs(chip.value)}
        </span>)}
      </div>
      <BattleTeamStrip team={team} activeUid={monster.uid} enemy={enemy} acting={acting}/>
    </div>
  </section>;
}
