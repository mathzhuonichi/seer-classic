import { useEffect, type ComponentType, type ReactNode } from 'react';
import type { BattleMonsterView, BossEvidenceView } from '../../../shared/views.ts';
import { skillIconType } from '../../../shared/element-types.ts';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';

type EvidenceTable = ComponentType<{ evidence: BossEvidenceView }>;
/** The Boss evidence table: features/challenges owns Boss evidence and provides it, since battle UI may not import challenges. */
let EvidenceContent: EvidenceTable = () => null;
export const provideEvidenceContent = (table: EvidenceTable) => { EvidenceContent = table; };

/** A modal over the battle; a click on the backdrop closes it. */
function BattleModal({ className, label, title, closeLabel, autoFocus = false, onClose, children }: {
  className: string; label: string; title: string; closeLabel: string; autoFocus?: boolean; onClose: () => void; children: ReactNode;
}) {
  return <div className="classic-detail-backdrop" onClick={onClose}>
    <section className={className} role="dialog" aria-modal="true" aria-label={label} onClick={event => event.stopPropagation()}>
      <header><strong>{title}</strong><button autoFocus={autoFocus} aria-label={closeLabel} onClick={onClose}>×</button></header>
      {children}
    </section>
  </div>;
}

/** Sources and inferred parameters of a Boss opponent; Escape closes it. */
export function BattleEvidenceDialog({ name, evidence, onClose }: { name: string; evidence: BossEvidenceView; onClose: () => void }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose]);
  return <BattleModal className="classic-boss-evidence-modal" label={`${name}参数依据`} title={`${name} · 资料依据`} closeLabel="关闭资料依据" autoFocus onClose={onClose}>
    <EvidenceContent evidence={evidence}/>
  </BattleModal>;
}

export function BattleCreatureDetails({ monster, onClose }: { monster: BattleMonsterView; onClose: () => void }) {
  return <BattleModal className="classic-creature-details" label={`${monster.name}战斗详情`} title={`${monster.name} · Lv.${monster.level}`}
    closeLabel="关闭精灵详情" onClose={onClose}>
    <p><TypeIcon type={monster.types}/> · 体力 {monster.hp}/{monster.maxHp}</p>
    <p>{monster.statuses.length ? monster.statuses.join(' · ') : '无异常状态'}</p>
    <div>{monster.skills.map(skill => <article key={skill.id}>
      <strong>{skill.name}</strong>
      <span><TypeIcon type={skillIconType(skill)}/> {skill.category} · 威力 {skill.power || '—'} · PP {skill.pp}/{skill.maxPp}</span>
      <p>{skill.description}</p>
    </article>)}</div>
  </BattleModal>;
}
