import type { BattleMonsterView, BattleView } from '../../game-types.ts';
import { getCreatureArt } from '../../presentation/creature-art.ts';
import { hpPercent } from '../../presentation/view-helpers.ts';
import { appearanceOf } from '../../presentation/monster-views.ts';
import TypeIcon from '../TypeIcon.tsx';

/** The party with the selected creature's summary, details and switch-in. */
export default function BattlePartyPane({ battle, selected, disabled, onSelect, onDetails, onSwitch }: {
  battle: BattleView; selected: BattleMonsterView; disabled: boolean; onSelect: (uid: string) => void; onDetails: () => void; onSwitch: (uid: string) => void;
}) {
  const active = battle.player.uid;
  return <>
    <div className="classic-command-caption"><span>{battle.needsSwitch ? '当前精灵无法战斗，请选择替补' : '选择精灵'}</span><small>选择后点击出战</small></div>
    <div className="classic-party-grid">{battle.party.map(monster =>
      <button key={monster.uid} disabled={disabled} className={`${monster.uid === active ? 'current' : ''} ${monster.uid === selected.uid ? 'selected' : ''}`}
        aria-pressed={monster.uid === selected.uid} onClick={() => onSelect(monster.uid)}>
        <img src={getCreatureArt(appearanceOf(monster)).src} alt="" />
        <strong>{monster.name}<small>Lv.{monster.level}</small></strong>
        <span>{monster.uid === active ? '出战中' : monster.hp <= 0 ? '无法战斗' : `${monster.hp} / ${monster.maxHp}`}</span>
        <i style={{ width: `${hpPercent(monster.hp, monster.maxHp)}%` }} />
      </button>)}</div>
    <div className="classic-party-actions">
      <span>{selected.name} · <TypeIcon type={selected.types}/> · HP {selected.hp}/{selected.maxHp}</span>
      <button disabled={disabled} onClick={onDetails}>详情</button>
      <button className="classic-confirm" disabled={disabled || selected.uid === active || selected.hp <= 0} onClick={() => onSwitch(selected.uid)}>出战</button>
    </div>
  </>;
}
