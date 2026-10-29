import type { MonsterView } from '../../../../shared/views.ts';
import {STAT_KEYS} from '../../../../../raising/core/types.ts';
import {IV_MAX} from '../../../../../raising/core/stats.ts';
import {STAT_LABELS} from '../../../../shared/labels.ts';
import {speciesNumber} from '../../../../shared/monster-views.ts';
import {HoverTerm} from '../../../../shared/ui/HoverCard.tsx';
import {SkillRow} from '../../../../shared/ui/SkillDetail.tsx';

/** 信息: the monster's summary; its skins are under the PetBag's portrait. */
export default function OverviewTab({m}:{m:MonsterView}) {
  return <MonsterSummary m={m}/>;
}

/** Identity, base stats, EXP bar and equipped skills. */
function MonsterSummary({m}:{m:MonsterView}) {
  return <div className="petbag-overview">
    <div className="petbag-information">
      <div><span>精灵编号</span><strong>{speciesNumber(m.species)}</strong></div>
      <div><span>性格</span><HoverTerm name={m.nature.name} detail={m.nature.effect}/></div>
      <div><span>个体值</span><strong>{m.iv} / {IV_MAX}</strong></div>
      <div><span>特性</span>{m.trait?<HoverTerm name={m.trait.name} detail={m.trait.description}/>:<strong>无</strong>}</div>
    </div>
    <p className="engraving-stat-note">基础能力（不含刻印）</p>
    <div className="petbag-stat-summary">{STAT_KEYS.map(key=><div key={key}><span>{STAT_LABELS[key]}</span><strong>{m.stats[key]}</strong></div>)}</div>
    <div className="petbag-experience"><span>升级经验</span><meter value={m.exp} max={Math.max(1,m.expToNext)}/><small>{m.exp} / {m.expToNext}</small></div>
    <div className="petbag-skill-summary"><strong>当前技能</strong>
      {m.skills.map(sk=><SkillRow key={sk.id} skill={sk}><span>{sk.name}</span><small>PP {sk.pp}/{sk.maxPp}</small></SkillRow>)}
    </div>
  </div>;
}
