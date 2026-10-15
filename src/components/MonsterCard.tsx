import type {MonsterView,SpeciesView} from '../game-types';
import {CreatureArt} from './CreatureArt';
import TypeIcon from './TypeIcon';
import '../management.css';
import './petbag-party-card.css';
export default function MonsterCard({monster,onClick,selected=false,compact=false,slot,presentation}:{monster:MonsterView|SpeciesView;onClick:()=>void;selected?:boolean;compact?:boolean;slot?:number;presentation?:'petbag-party'}) {
  const species='species' in monster?monster.species:monster.id;
  const appearanceSpecies='species' in monster?monster.appearanceSpecies??monster.species:monster.id;
  const owned='owned' in monster?monster.owned:true;
  const isMonster='level' in monster;
  if(presentation==='petbag-party')return <button type="button" className={`monster-card petbag-party-card ${selected?'selected':''}`} aria-pressed={selected} onClick={onClick} title={`${monster.name}${isMonster?` · Lv.${monster.level} · 体力 ${monster.hp}/${monster.stats.hp}`:''}`}>
    <span className="petbag-party-number">{slot??`#${species}`}</span>
    <small className="petbag-party-level">{isMonster?`Lv.${monster.level}`:owned?'已收集':'未收集'}</small>
    <div className="petbag-party-art"><CreatureArt species={appearanceSpecies} name={monster.name} fill={.96} scaleByStage={false} verticalAlign="center"/></div>
    <span className="petbag-party-identity"><strong>{monster.name}</strong><span className="petbag-party-type"><TypeIcon type={monster.types} focusable={false}/></span></span>
    {isMonster&&<span className="petbag-party-hp"><span className="petbag-party-hp-track" aria-hidden="true"><i style={{width:`${Math.max(0,Math.min(100,monster.hp/monster.stats.hp*100))}%`}}/></span><span>HP {monster.hp}/{monster.stats.hp}</span></span>}
  </button>;
  return <button className={`monster-card ${compact?'compact-monster':''} ${selected?'selected':''}`} aria-pressed={selected} onClick={onClick}>
    <span className="number">{slot!==undefined?`${String(slot).padStart(2,'0')}`:`#${String(species).padStart(4,'0')}`}</span>
    <div className="management-card-art"><CreatureArt species={appearanceSpecies} name={monster.name}/></div>
    <span className="management-card-copy"><strong>{monster.name}</strong><span className="meta"><span className="monster-card-types"><TypeIcon type={monster.types} focusable={false}/></span><span>{isMonster?`Lv.${monster.level}`:owned?'已收集':'未收集'}</span></span>
    {isMonster&&<span className="card-hp"><i style={{width:`${Math.max(0,Math.min(100,monster.hp/monster.stats.hp*100))}%`}}/><span>{compact?`${monster.hp}/${monster.stats.hp}`:`${monster.inParty?'出战':'仓库'} · ${monster.hp}/${monster.stats.hp}`}</span></span>}</span>
  </button>;
}
