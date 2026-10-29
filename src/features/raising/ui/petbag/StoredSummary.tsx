import type { MonsterView } from '../../../../shared/views.ts';
import {STAT_KEYS} from '../../../../../raising/core/types.ts';
import {IV_MAX} from '../../../../../raising/core/stats.ts';
import {skillIconType} from '../../../../shared/element-types.ts';
import {ENGRAVING_SLOT_LABELS,STAT_LABELS} from '../../../../shared/labels.ts';
import {appearanceOf,speciesNumber} from '../../../../shared/monster-views.ts';
import {CreatureArt} from '../../../../shared/ui/CreatureArt.tsx';
import {HoverTerm} from '../../../../shared/ui/HoverCard.tsx';
import {SkillRow} from '../../../../shared/ui/SkillDetail.tsx';
import TypeIcon from '../../../../shared/ui/TypeIcon.tsx';
import EngravingMark from './EngravingMark.tsx';

/**
 * A stored monster at a glance, sized to fit the box without scrolling: art beside its identity; then its stats (with the
 * engravings' bonus) and EXP, its two engravings, and its skills.
 */
export default function StoredSummary({m}:{m:MonsterView}) {
  return <div className="storage-summary">
    <div className="storage-summary-top">
      <div className="storage-info-art"><CreatureArt species={appearanceOf(m)} name={m.name} fill={.95} verticalAlign="center"/></div>
      <dl className="storage-facts">
        <div><dt>精灵编号</dt><dd>{speciesNumber(m.species)}</dd></div>
        <div><dt>性格</dt><dd><HoverTerm name={m.nature.name} detail={m.nature.effect}/></dd></div>
        <div><dt>个体值</dt><dd>{m.iv} / {IV_MAX}</dd></div>
        <div><dt>特性</dt><dd>{m.trait?<HoverTerm name={m.trait.name} detail={m.trait.description}/>:'无'}</dd></div>
      </dl>
    </div>
    <div className="storage-stats" title="基础能力；绿色为刻印加成" aria-label="能力">{STAT_KEYS.map(key=>{
      const bonus=m.engravings.bonus[key];
      return <div key={key}><span>{STAT_LABELS[key]}</span><strong>{m.stats[key]}{bonus?<em>+{bonus}</em>:null}</strong></div>;
    })}</div>
    <div className="storage-experience"><span>升级经验</span><meter value={m.expToNext?m.exp:1} max={Math.max(1,m.expToNext)}/>
      <small>{m.expToNext?`${m.exp} / ${m.expToNext}`:'已满级'}</small></div>
    <div className="storage-engravings" aria-label="刻印">{(['ability','skill'] as const).map(slot=>{
      const engraving=m.engravings[slot];
      return <div key={slot} title={engraving?`${engraving.name}：${engraving.effect}${engraving.ready?'':`（未生效：${engraving.reason}）`}`:'未装备'}>
        <EngravingMark slot={slot} engraving={engraving} size={26}/>
        <span><small>{ENGRAVING_SLOT_LABELS[slot]}</small><strong>{engraving?.name??'未装备'}</strong></span></div>;
    })}</div>
    <div className="storage-skills" aria-label="当前技能">{m.skills.map(sk=><SkillRow key={sk.id} skill={sk}>
      <TypeIcon type={skillIconType(sk)} focusable={false} showTooltip={false}/><strong>{sk.name}</strong>
      <small>{sk.power?`威力 ${sk.power}`:sk.category}</small><small>PP {sk.pp}/{sk.maxPp}</small></SkillRow>)}</div>
  </div>;
}
