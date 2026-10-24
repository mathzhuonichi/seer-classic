import { useId } from 'react';
import type { BattleMonsterView } from '../../../shared/views.ts';
import { getCreatureArt } from '../../../shared/creature-art.ts';
import './battle-team-strip.css';
import {encounterLevelText} from '../../../shared/encounter-level.ts';
import {appearanceOf} from '../../../shared/monster-views.ts';
import {shownDown} from '../battle-playback.ts';

export interface BattleTeamStripProps {
  team: BattleMonsterView[]; activeUid: string; enemy?: boolean;
  /** The creature in battle is acting its move: at 0 HP it is counted out only once it is home, when it greys (`shownDown`). */
  acting?: boolean;
}

/** Hover/focus details preserve every creature from the supplied event-frame roster. */
export default function BattleTeamStrip({ team, activeUid, enemy = false, acting = false }: BattleTeamStripProps) {
  const down = (creature: BattleMonsterView) => shownDown(creature.hp, acting && creature.uid === activeUid);
  const remaining = team.reduce((total, creature) => total + Number(!down(creature)), 0);
  const side = enemy ? '对手' : '我方';
  const label = `${side}剩余精灵 ${remaining} / ${team.length}`;
  const tooltipId = useId();
  return <section className={`battle-team-strip ${enemy ? 'is-enemy' : 'is-player'}`} role="group" aria-label={label}>
    <button type="button" className="battle-team-count" aria-label={`${label}，查看队伍详情`} aria-describedby={tooltipId}><strong>{remaining}<i aria-hidden="true"> / </i>{team.length}</strong></button>
    <div className="battle-team-overlay" id={tooltipId} role="tooltip"><header><strong>{side}精灵队伍</strong><span>{remaining} / {team.length} 可战斗</span></header><ol className="battle-team-members" aria-label={`${side}精灵队伍`}>
      {team.map((creature, index) => {
        const fainted = down(creature);
        const active = creature.uid === activeUid;
        const level=encounterLevelText(creature.level,creature.levelMasked);
        const health = fainted ? '已失去战斗能力' : creature.hpHidden ? `体力 ${creature.hp}%` : `体力 ${creature.hp} / ${creature.maxHp}`;
        const description = `${creature.name}，${level}，${active ? '当前出战，' : ''}${health}`;
        const appearance = appearanceOf(creature);
        return <li key={`${creature.uid}-${index}`} className={`battle-team-member${active ? ' is-active' : ''}${fainted ? ' is-fainted' : ''}`}
          aria-label={description} title={description} data-species={creature.species} data-appearance-species={appearance} data-active={active} data-fainted={fainted}>
          <span className="battle-team-icon-wrap">
            <img className="battle-team-icon" src={getCreatureArt(appearance).src} alt="" draggable={false} decoding="async"/>
            {fainted && <span className="battle-team-faint-mark" aria-hidden="true">×</span>}
          </span>
          <div><strong>{creature.name}<small>{level}</small></strong>
            <span>{fainted ? '无法战斗' : creature.hpHidden ? `HP ${creature.hp}%` : `HP ${creature.hp}/${creature.maxHp}`}</span>{active && <em>当前出战</em>}</div>
        </li>;
      })}
    </ol></div>
  </section>;
}
