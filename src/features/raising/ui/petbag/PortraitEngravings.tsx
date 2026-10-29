import type { MonsterView } from '../../../../shared/views.ts';
import {ENGRAVING_SLOT_LABELS} from '../../../../shared/labels.ts';
import EngravingMark from './EngravingMark.tsx';

/** The two engravings under the PetBag's portrait, as in the original 精灵刻印 window; either opens 能力, where they are changed. */
export default function PortraitEngravings({m,onOpen}:{m:MonsterView;onOpen:()=>void}) {
  return <div className="petbag-engravings" role="group" aria-label="刻印">{(['ability','skill'] as const).map(slot=>{
    const engraving=m.engravings[slot],label=ENGRAVING_SLOT_LABELS[slot];
    const title=engraving?`${label}：${engraving.name}，${engraving.effect}${engraving.ready?'':`（未生效：${engraving.reason}）`}`:`${label}：未装备`;
    return <button key={slot} type="button" className="petbag-engraving" aria-label={`${title}。调整刻印`} title={`${title}。点击调整刻印`} onClick={onOpen}>
      <EngravingMark slot={slot} engraving={engraving} size={42}/></button>;
  })}</div>;
}
