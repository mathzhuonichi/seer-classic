import { useId } from 'react';
import type { BattleMonsterView } from '../game-types';
import './battle-team-strip.css';

export interface BattleTeamStripProps { team: BattleMonsterView[]; activeUid: string; enemy?: boolean }

/** Hover/focus details preserve every creature from the supplied event-frame roster. */
export function BattleTeamStrip({ team, activeUid, enemy = false }: BattleTeamStripProps) {
  const remaining = team.reduce((total, creature) => total + Number(creature.hp > 0), 0);
  const side = enemy ? '对手' : '我方';
  const label = `${side}剩余精灵 ${remaining} / ${team.length}`;
  const tooltipId = useId();
  return <section className={`battle-team-strip ${enemy ? 'is-enemy' : 'is-player'}`} role="group" aria-label={label}>
    <button type="button" className="battle-team-count" aria-label={`${label}，查看队伍详情`} aria-describedby={tooltipId}><strong>{remaining}<i aria-hidden="true"> / </i>{team.length}</strong></button>
    <div className="battle-team-overlay" id={tooltipId} role="tooltip"><header><strong>{side}精灵队伍</strong><span>{remaining} / {team.length} 可战斗</span></header><ol className="battle-team-members" aria-label={`${side}精灵队伍`}>
      {team.map((creature, index) => {
        const fainted = creature.hp <= 0;
        const active = creature.uid === activeUid;
        const description = `${creature.name}，Lv.${creature.level}，${active ? '当前出战，' : ''}${fainted ? '已失去战斗能力' : `体力 ${creature.hp} / ${creature.maxHp}`}`;
        return <li key={`${creature.uid}-${index}`} className={`battle-team-member${active ? ' is-active' : ''}${fainted ? ' is-fainted' : ''}`} aria-label={description} title={description} data-species={creature.species} data-appearance-species={creature.appearanceSpecies??creature.species} data-active={active} data-fainted={fainted}>
          <span className="battle-team-icon-wrap"><img className="battle-team-icon" src={creature.portrait??`/portraits/${creature.appearanceSpecies??creature.species}.png`} alt="" draggable={false} decoding="async"/>{fainted && <span className="battle-team-faint-mark" aria-hidden="true">×</span>}</span>
          <div><strong>{creature.name}<small>Lv.{creature.level}</small></strong><span>{fainted ? '无法战斗' : `HP ${creature.hp}/${creature.maxHp}`}</span>{active && <em>当前出战</em>}</div>
        </li>;
      })}
    </ol></div>
  </section>;
}
export default BattleTeamStrip;
