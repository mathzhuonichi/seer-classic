import type { EngravingView } from '../../../../shared/views.ts';
import {getItemIcon} from '../../../../shared/item-icons.ts';
import ItemIcon from '../../../../shared/ui/ItemIcon.tsx';

/** The original's empty-slot shapes, cut from a mark of each kind: the ability marks' comet and the skill marks' four-point star. */
const HOLES={ability:getItemIcon(10001,undefined,true).src,skill:getItemIcon(20001,undefined,true).src};

/**
 * One engraving slot as the original 精灵刻印 window draws it: the equipped mark, or, when empty, the outline of its kind of mark
 * sunk into the panel. No frame and no label; the caller names the slot.
 */
export default function EngravingMark({slot,engraving,size}:{slot:'ability'|'skill';engraving:EngravingView|null;size:number}) {
  if(engraving)return <ItemIcon id={engraving.id} engraving label={engraving.name} size={size}
    className={engraving.ready?'engraving-mark':'engraving-mark is-inactive'}/>;
  const hole=`url(${HOLES[slot]})`;
  return <span className="engraving-mark is-empty" style={{width:size,height:size}} aria-hidden="true">
    <i style={{maskImage:hole,WebkitMaskImage:hole}}/></span>;
}
