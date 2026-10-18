import type {MonsterView,SpeciesView} from '../game-types.ts';
import {hpPercent} from '../presentation/view-helpers.ts';
import {appearanceOf,speciesNumber} from '../presentation/monster-views.ts';
import {CreatureArt} from './CreatureArt.tsx';
import TypeIcon from './TypeIcon.tsx';
import '../management.css';
import './petbag-party-card.css';

type Props={monster:MonsterView|SpeciesView;onClick:()=>void;selected?:boolean;compact?:boolean;slot?:number;presentation?:'petbag-party'};

/** An owned monster (with level and HP) or a dex species (collected or not); `petbag-party` is the bag's bottom strip. */
export default function MonsterCard({monster,onClick,selected=false,compact=false,slot,presentation}:Props) {
  const mon='level' in monster?monster:undefined;
  const species=mon?mon.species:(monster as SpeciesView).id,art=mon?appearanceOf(mon):species;
  const tag=mon?`Lv.${mon.level}`:(monster as SpeciesView).owned?'已收集':'未收集';
  const hpWidth=mon&&`${hpPercent(mon.hp,mon.stats.hp)}%`;
  if(presentation==='petbag-party')return <button type="button" className={`monster-card petbag-party-card ${selected?'selected':''}`} aria-pressed={selected} onClick={onClick} title={`${monster.name}${mon?` · Lv.${mon.level} · 体力 ${mon.hp}/${mon.stats.hp}`:''}`}>
    <span className="petbag-party-number">{slot??`#${species}`}</span>
    <small className="petbag-party-level">{tag}</small>
    <div className="petbag-party-art"><CreatureArt species={art} name={monster.name} fill={.96} verticalAlign="center"/></div>
    <span className="petbag-party-identity"><strong>{monster.name}</strong><span className="petbag-party-type"><TypeIcon type={monster.types} focusable={false}/></span></span>
    {mon&&<span className="petbag-party-hp"><span className="petbag-party-hp-track" aria-hidden="true"><i style={{width:hpWidth}}/></span><span>HP {mon.hp}/{mon.stats.hp}</span></span>}
  </button>;
  return <button className={`monster-card ${compact?'compact-monster':''} ${selected?'selected':''}`} aria-pressed={selected} onClick={onClick}>
    <span className="number">{slot!==undefined?String(slot).padStart(2,'0'):`#${speciesNumber(species)}`}</span>
    <div className="management-card-art"><CreatureArt species={art} name={monster.name}/></div>
    <span className="management-card-copy"><strong>{monster.name}</strong><span className="meta"><span className="monster-card-types"><TypeIcon type={monster.types} focusable={false}/></span><span>{tag}</span></span>
    {mon&&<span className="card-hp"><i style={{width:hpWidth}}/><span>{compact?`${mon.hp}/${mon.stats.hp}`:`${mon.inParty?'出战':'仓库'} · ${mon.hp}/${mon.stats.hp}`}</span></span>}</span>
  </button>;
}
