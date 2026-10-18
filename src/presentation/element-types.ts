import iconAssets from './type-icon-assets.json';
import {TYPE_LABELS} from './labels.ts';

interface TypeAsset {path:string;sha256:string;name?:string;types?:string[];typeId?:number}
export const typeAssets=iconAssets as Record<string,TypeAsset>;
export type ElementTypes=string|readonly string[];
function normalize(input:ElementTypes):string[] {
  const parts=typeof input==='string'?input.trim().split(/[\s_/·]+/):input;
  return parts.map(type=>TYPE_LABELS[type]??(type.replace(/属性技能$|属性$|系$/,'')||'属性'));
}
export function elementName(input:ElementTypes):string {
  const key=normalize(input).join('');
  return typeAssets[key]?.name??key;
}
export function elementParts(input:ElementTypes):string[] {
  const parts=normalize(input);
  return typeAssets[parts.join('')]?.types??parts;
}
/** Keep explicitly typed status moves intact; ordinary status moves use the original property symbol. */
export function skillIconType(skill:{type:ElementTypes;category:string}):ElementTypes {
  return ['属性','status'].includes(skill.category)&&elementName(skill.type)==='普通'?'属性':skill.type;
}
export function matchesElement(types:readonly string[],filter:string):boolean {
  if(filter==='全部属性')return true;
  if(filter==='仅单属性')return types.length===1;
  if(filter==='仅双属性')return types.length===2;
  return types.includes(filter)||elementName(types)===filter;
}
export function elementChoices(groups:readonly (readonly string[])[]) {
  const singles=[...new Set(groups.flat())];
  const duals=[...new Set(groups.filter(types=>types.length===2).map(elementName))]
    .sort((a,b)=>(typeAssets[a]?.typeId??0)-(typeAssets[b]?.typeId??0));
  return {singles,duals};
}
