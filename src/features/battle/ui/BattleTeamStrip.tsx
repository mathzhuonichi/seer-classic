import { useId } from 'react';
import type { BattleMonsterView } from '../../../shared/views.ts';
import { getCreatureArt } from '../../../shared/creature-art.ts';
import './battle-team-strip.css';
import {encounterLevelText} from '../../../shared/encounter-level.ts';
import {appearanceOf} from '../../../shared/monster-views.ts';
import {shownDown} from '../battle-playback.ts';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';

export interface BattleTeamStripProps {
  team: BattleMonsterView[]; activeUid: string; enemy?: boolean;
  /** The creature in battle is acting its move: at 0 HP it is counted out only once it is home, when it greys (`shownDown`). */
  acting?: boolean;
}

/** The strip marks every member with the 普通 type's icon, as the original's one creature icon, lit or dark; details show a foe not yet in battle as it too. */
const TEAM_ICON = '普通', UNKNOWN_NAME = '未知精灵';

/** A member's portrait in the details, or the team icon for a foe the player has not seen. */
const Face = ({ creature, className }: { creature: BattleMonsterView; className?: string }) => creature.unseen
  ? <span className={`battle-team-unknown ${className ?? ''}`}><TypeIcon type={TEAM_ICON} focusable={false} showTooltip={false}/></span>
  : <img className={className} src={getCreatureArt(appearanceOf(creature)).src} alt="" draggable={false} decoding="async"/>;

/** Hover/focus details preserve every creature from the supplied event-frame roster with its type; a foe not yet seen stays unknown. */
export default function BattleTeamStrip({ team, activeUid, enemy = false, acting = false }: BattleTeamStripProps) {
  const down = (creature: BattleMonsterView) => shownDown(creature.hp, acting && creature.uid === activeUid);
  const remaining = team.reduce((total, creature) => total + Number(!down(creature)), 0);
  const side = enemy ? '对手' : '我方';
  const label = `${side}剩余精灵 ${remaining} / ${team.length}`;
  const tooltipId = useId();
  return <section className={`battle-team-strip ${enemy ? 'is-enemy' : 'is-player'}`} role="group" aria-label={label}>
    <button type="button" className="battle-team-count" aria-label={`${label}，查看队伍详情`} aria-describedby={tooltipId}>
      <span className="battle-team-marks" aria-hidden="true">{team.map((creature, index) => <span key={`${creature.uid}-${index}`}
        className={down(creature) ? 'is-down' : undefined}><TypeIcon type={TEAM_ICON} focusable={false} showTooltip={false}/></span>)}</span></button>
    <div className="battle-team-overlay" id={tooltipId} role="tooltip"><header><strong>{side}精灵队伍</strong><span>{remaining} / {team.length} 可战斗</span></header><ol className="battle-team-members" aria-label={`${side}精灵队伍`}>
      {team.map((creature, index) => {
        const fainted = down(creature);
        const active = creature.uid === activeUid;
        if (creature.unseen) return <li key={`${creature.uid}-${index}`} className="battle-team-member is-unknown" aria-label={`${UNKNOWN_NAME}，尚未出场`}
          title={`${UNKNOWN_NAME}，尚未出场`}><span className="battle-team-icon-wrap"><Face creature={creature}/></span>
          <div><strong>{UNKNOWN_NAME}</strong><span>尚未出场</span></div></li>;
        const level=encounterLevelText(creature.level,creature.levelMasked);
        const health = fainted ? '已失去战斗能力' : creature.hpHidden ? `体力 ${creature.hp}%` : `体力 ${creature.hp} / ${creature.maxHp}`;
        const description = `${creature.name}，${level}，${active ? '当前出战，' : ''}${health}`;
        const appearance = appearanceOf(creature);
        return <li key={`${creature.uid}-${index}`} className={`battle-team-member${active ? ' is-active' : ''}${fainted ? ' is-fainted' : ''}`}
          aria-label={description} title={description} data-species={creature.species} data-appearance-species={appearance} data-active={active} data-fainted={fainted}>
          <span className="battle-team-icon-wrap">
            <Face creature={creature} className="battle-team-icon"/>
            {fainted && <span className="battle-team-faint-mark" aria-hidden="true">×</span>}
          </span>
          <div><span className="battle-team-types"><TypeIcon type={creature.types} focusable={false} showTooltip={false}/></span>
            <strong>{creature.name}<small>{level}</small></strong>
            <span>{fainted ? '无法战斗' : creature.hpHidden ? `HP ${creature.hp}%` : `HP ${creature.hp}/${creature.maxHp}`}</span>{active && <em>当前出战</em>}</div>
        </li>;
      })}
    </ol></div>
  </section>;
}
