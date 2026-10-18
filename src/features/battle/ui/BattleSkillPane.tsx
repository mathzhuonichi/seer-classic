import type { BattleMonsterView } from '../../../kernel/contract.ts';
import { BATTLE_SKILL_SLOTS, battleSkills } from '../battle-hud.ts';
import { skillIconType } from '../../../shared/element-types.ts';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';

/** Four skill slots; Struggle replaces them once every skill is out of PP. */
export default function BattleSkillPane({ player, blocked, onMove }: { player: BattleMonsterView; blocked: boolean; onMove: (skillId: number) => void }) {
  const skills = battleSkills(player);
  return <>
    <div className="classic-command-caption"><span>选择技能</span><small>将鼠标停留在技能上查看效果</small></div>
    <div className="classic-skill-grid">{Array.from({ length: BATTLE_SKILL_SLOTS }, (_, slot) => {
      const skill = skills[slot];
      if (!skill) return <div className="classic-empty-skill" key={slot}>未装备技能</div>;
      const title = skill.description || `${skill.name}：${skill.category}技能，威力 ${skill.power}`;
      return <button key={`${slot}-${skill.id}`} className={`classic-skill category-${skill.category}`} title={title}
        disabled={blocked || (skill.maxPp > 0 && skill.pp <= 0)} onClick={() => onMove(skill.id)}>
        <div><TypeIcon type={skillIconType(skill)} focusable={false}/><small>{skill.category}</small></div>
        <strong>{skill.name}</strong>
        <footer><span>威力 <b>{skill.power || '—'}</b></span><span>PP <b>{skill.pp}</b> / {skill.maxPp}</span></footer>
      </button>;
    })}</div>
  </>;
}
