import { useId } from 'react';
import type { BattleMonsterView } from '../../game-types.ts';
import { getCreatureArt } from '../../presentation/creature-art.ts';
import './battle-team-strip.css';
import {encounterLevelText} from '../../presentation/encounter-level.ts';
import {appearanceOf} from '../../presentation/monster-views.ts';

export interface BattleTeamStripProps { team: BattleMonsterView[]; activeUid: string; enemy?: boolean }

/** Hover/focus details preserve every creature from the supplied event-frame roster. */
export default function BattleTeamStrip({ team, activeUid, enemy = false }: BattleTeamStripProps) {
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
        const level=encounterLevelText(creature.level,enemy&&creature.evidence?.hasInferredLevel,enemy&&creature.evidence?.displayLevelUnknown);
        const description = `${creature.name}，${level}，${enemy&&creature.evidence?.hasInferredStats?'含推定参数，':''}${active ? '当前出战，' : ''}${fainted ? '已失去战斗能力' : creature.hpHidden ? `体力 ${creature.hp}%` : `体力 ${creature.hp} / ${creature.maxHp}`}`;
        const appearance = appearanceOf(creature);
        return <li key={`${creature.uid}-${index}`} className={`battle-team-member${active ? ' is-active' : ''}${fainted ? ' is-fainted' : ''}`}
          aria-label={description} title={description} data-species={creature.species} data-appearance-species={appearance} data-active={active} data-fainted={fainted}>
          <span className="battle-team-icon-wrap">
            <img className="battle-team-icon" src={getCreatureArt(appearance).src} alt="" draggable={false} decoding="async"/>
            {fainted && <span className="battle-team-faint-mark" aria-hidden="true">×</span>}
          </span>
          <div><strong>{creature.name}<small>{level}</small></strong><span>{fainted ? '无法战斗' : creature.hpHidden ? `HP ${creature.hp}%` : `HP ${creature.hp}/${creature.maxHp}`}</span>{active && <em>当前出战</em>}{enemy&&creature.evidence?.hasInferredStats&&<em>含推定参数</em>}</div>
        </li>;
      })}
    </ol></div>
  </section>;
}
