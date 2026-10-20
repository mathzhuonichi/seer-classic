import type {ReactNode} from 'react';
import type {SkillView} from '../views.ts';
import {elementParts,skillIconType} from '../element-types.ts';
import {effectText,skillFacts} from '../skill-text.ts';
import HoverCard,{useHoverCard,type HoverCardProps} from './HoverCard.tsx';
import TypeIcon from './TypeIcon.tsx';
import './skill-detail.css';

/** A skill's details: name, type and category, its facts (威力, 命中, PP, 连击, 先制, 致命一击) and its effect. Colours follow the container. */
export function SkillDetail({skill}:{skill:SkillView}) {
  return <div className="skill-detail">
    <header><TypeIcon type={skillIconType(skill)} focusable={false} showTooltip={false}/><strong>{skill.name}</strong>
      <span>{elementParts(skill.type).join('·')}系 · {skill.category}</span></header>
    <dl>{skillFacts(skill).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>{effectText(skill)}</p>
  </div>;
}

const SkillCard=({card,skill}:{card:HoverCardProps;skill:SkillView})=>
  <HoverCard {...card} className="skill-hover-card"><SkillDetail skill={skill}/></HoverCard>;

interface SkillButtonProps {skill:SkillView;className?:string;disabled?:boolean;pressed?:boolean;onClick:()=>void;children:ReactNode}

/** A skill's button with its details on hover or keyboard focus; `pressed` marks a toggle button's state. */
export function SkillButton({skill,className,disabled,pressed,onClick,children}:SkillButtonProps) {
  const {trigger,card}=useHoverCard<HTMLButtonElement>();
  return <><button {...trigger} type="button" className={className} disabled={disabled} aria-pressed={pressed} onClick={onClick}>{children}</button>
    <SkillCard card={card} skill={skill}/></>;
}

/** A skill's row that is not a control, focusable for its details. */
export function SkillRow({skill,children}:{skill:SkillView;children:ReactNode}) {
  const {trigger,card}=useHoverCard<HTMLDivElement>();
  return <><div {...trigger} tabIndex={0}>{children}</div><SkillCard card={card} skill={skill}/></>;
}
