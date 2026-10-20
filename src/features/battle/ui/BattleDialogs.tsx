import { useEffect } from 'react';
import type { BattleMonsterView } from '../../../shared/views.ts';
import { skillIconType } from '../../../shared/element-types.ts';
import { effectText, skillFacts } from '../../../shared/skill-text.ts';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';

/** A party member's battle details over the battle; a click on the backdrop or Escape closes them. */
export function BattleCreatureDetails({ monster, onClose }: { monster: BattleMonsterView; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="classic-detail-backdrop" onClick={onClose}>
    <section className="classic-creature-details" role="dialog" aria-modal="true" aria-label={`${monster.name}战斗详情`}
      onClick={event => event.stopPropagation()}>
      <header><strong>{`${monster.name} · Lv.${monster.level}`}</strong><button aria-label="关闭精灵详情" onClick={onClose}>×</button></header>
      <p><TypeIcon type={monster.types}/> · 体力 {monster.hp}/{monster.maxHp}</p>
      <p>{monster.statuses.length ? monster.statuses.join(' · ') : '无异常状态'}</p>
      <div>{monster.skills.map(skill => <article key={skill.id}>
        <strong>{skill.name}</strong>
        <span><TypeIcon type={skillIconType(skill)}/> {[skill.category, ...skillFacts(skill).map(fact => fact.join(' '))].join(' · ')}</span>
        <p>{effectText(skill)}</p>
      </article>)}</div>
    </section>
  </div>;
}
