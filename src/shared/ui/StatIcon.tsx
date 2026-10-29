import type {StatKey} from '../../../raising/core/stats.ts';
import {STAT_ICONS} from './stat-icon-paths.ts';
import './stat-icon.css';

/** A stat's official PetBag icon; the label beside it names the stat, so the icon is decorative. */
export default function StatIcon({stat}:{stat:StatKey}) {
  const {viewBox,layers}=STAT_ICONS[stat];
  return <svg className="stat-icon" viewBox={viewBox} aria-hidden="true" focusable="false">{layers.map((layer,index)=>'fill' in layer
    ?<path key={index} fill={layer.fill} d={layer.d}/>
    :<path key={index} fill="none" stroke={layer.stroke} strokeWidth={layer.width} strokeLinecap="round" strokeLinejoin="round" d={layer.d}/>)}</svg>;
}
