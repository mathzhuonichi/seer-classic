import type { MonsterView } from '../../../../shared/views.ts';
import type {StatKey} from '../../../../../raising/core/stats.ts';
import {IV_MAX} from '../../../../../raising/core/stats.ts';
import {STAT_LABELS} from '../../../../shared/labels.ts';
import {speciesNumber} from '../../../../shared/monster-views.ts';
import {skillIconType} from '../../../../shared/element-types.ts';
import {HoverTerm} from '../../../../shared/ui/HoverCard.tsx';
import {SkillRow} from '../../../../shared/ui/SkillDetail.tsx';
import StatIcon from '../../../../shared/ui/StatIcon.tsx';
import TypeIcon from '../../../../shared/ui/TypeIcon.tsx';

/** The original PetBag's order, read row by row in two columns: 攻击 防御 / 特攻 特防 / 速度 体力. */
const SUMMARY_STATS:readonly StatKey[]=['atk','def','spa','spd','spe','hp'];

/** 信息: the monster's summary; its skins are under the PetBag's portrait. `onAllocate` opens the 经验分配器 under 资料. */
export default function OverviewTab({m,onAllocate}:{m:MonsterView;onAllocate:()=>void}) {
  return <MonsterSummary m={m} onAllocate={onAllocate}/>;
}

/** Identity, base stats, EXP bar and equipped skills. */
function MonsterSummary({m,onAllocate}:{m:MonsterView;onAllocate:()=>void}) {
  return <div className="petbag-overview">
    <div className="petbag-information">
      <div><span>精灵编号</span><strong>{speciesNumber(m.species)}</strong></div>
      <div><span>性格</span><HoverTerm name={m.nature.name} detail={m.nature.effect}/></div>
      <div><span>个体值</span><strong>{m.iv} / {IV_MAX}</strong></div>
      <div><span>特性</span>{m.trait?<HoverTerm name={m.trait.name} detail={m.trait.description}/>:<strong>无</strong>}</div>
    </div>
    <p className="engraving-stat-note">基础能力（不含刻印）</p>
    <div className="petbag-stat-summary">{SUMMARY_STATS.map(key=>
      <div key={key}><span><StatIcon stat={key}/>{STAT_LABELS[key]}</span><strong>{m.stats[key]}</strong></div>)}</div>
    <div className="petbag-experience"><span>升级经验</span><meter value={m.exp} max={Math.max(1,m.expToNext)}/><small>{m.exp} / {m.expToNext}</small>
      <button type="button" onClick={onAllocate}>分配经验</button></div>
    <div className="petbag-skill-summary"><strong>当前技能</strong>
      {m.skills.map(sk=><SkillRow key={sk.id} skill={sk}>
        <TypeIcon type={skillIconType(sk)} focusable={false} showTooltip={false}/><span>{sk.name}</span>
        <small><b className="petbag-skill-category">{sk.category}</b>PP {sk.pp}/{sk.maxPp}</small>
      </SkillRow>)}
    </div>
  </div>;
}
