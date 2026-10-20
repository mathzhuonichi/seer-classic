import type { BattleMonsterView } from '../../../shared/views.ts';
import { BATTLE_SKILL_SLOTS, battleSkills } from '../battle-hud.ts';
import { skillIconType } from '../../../shared/element-types.ts';
import { powerText, priorityTag } from '../../../shared/skill-text.ts';
import { SkillButton } from '../../../shared/ui/SkillDetail.tsx';
import TypeIcon from '../../../shared/ui/TypeIcon.tsx';
import './battle-skill-pane.css';

/** Four skill slots; Struggle replaces them once every skill is out of PP. Each card shows a multi-hit attack's hits and a 先制 tag. */
export default function BattleSkillPane({ player, blocked, onMove }: { player: BattleMonsterView; blocked: boolean; onMove: (skillId: number) => void }) {
  const skills = battleSkills(player);
  return <>
    <div className="classic-command-caption"><span>选择技能</span><small>将鼠标停留在技能上查看效果</small></div>
    <div className="classic-skill-grid">{Array.from({ length: BATTLE_SKILL_SLOTS }, (_, slot) => {
      const skill = skills[slot];
      if (!skill) return <div className="classic-empty-skill" key={slot}>未装备技能</div>;
      return <SkillButton key={`${slot}-${skill.id}`} skill={skill} className={`classic-skill category-${skill.category}${skill.priority ? ' has-tag' : ''}`}
        disabled={blocked || (skill.maxPp > 0 && skill.pp <= 0)} onClick={() => onMove(skill.id)}>
        <div><TypeIcon type={skillIconType(skill)} focusable={false} showTooltip={false}/><small>{skill.category}</small></div>
        <strong>{skill.name}</strong>
        {!!skill.priority && <em className="classic-skill-tag">{priorityTag(skill.priority)}</em>}
        <footer><span>威力 <b>{powerText(skill)}</b></span><span>PP <b>{skill.pp}</b> / {skill.maxPp}</span></footer>
      </SkillButton>;
    })}</div>
  </>;
}
