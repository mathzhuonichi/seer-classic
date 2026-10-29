import iconAssets from './type-icon-assets.json';
import {TYPE_LABELS} from './labels.ts';

/** Official element button art keyed by Chinese name; dual entries also list their parts and source type id. */
interface TypeAsset {path:string;sha256:string;name?:string;types?:string[];typeId?:number}
const typeAssets=iconAssets as Record<string,TypeAsset>;

export type ElementTypes=string|readonly string[];
export interface ElementFilterOption {value:string;label:string;kind:'count'|'single'|'dual'}

/** Filter values that select by element count; every other filter value names an element or a dual pair. */
export const ALL_ELEMENTS='全部属性',SINGLE_ELEMENTS='仅单属性',DUAL_ELEMENTS='仅双属性';

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
/** The accessible label and, when official art exists, the cache-busted icon source. */
export function elementIcon(input:ElementTypes):{name:string;label:string;src?:string} {
  const name=elementName(input),parts=elementParts(input),asset=typeAssets[name];
  const label=name==='属性'?'属性技能':parts.length>1?`${parts.join('·')}属性（双属性）`:`${name}属性`;
  return {name,label,src:asset&&`${asset.path}?v=${asset.sha256.slice(0,12)}`};
}
/** Keep explicitly typed status moves intact; ordinary status moves use the original property symbol. */
export function skillIconType(skill:{type:ElementTypes;category:string}):ElementTypes {
  return ['属性','status'].includes(skill.category)&&elementName(skill.type)==='普通'?'属性':skill.type;
}
export function matchesElement(types:readonly string[],filter:string):boolean {
  if(filter===ALL_ELEMENTS)return true;
  if(filter===SINGLE_ELEMENTS)return types.length===1;
  if(filter===DUAL_ELEMENTS)return types.length===2;
  return types.includes(filter)||elementName(types)===filter;
}
/** Every single element with official art, in the art's order (草, 水, 火, 飞行, …); 属性 is the status moves' symbol, not an element. */
export const ELEMENTS=Object.keys(typeAssets).filter(name=>!typeAssets[name].types&&name!=='属性');
/** The single elements of some type lists (the dex's: the elements of 2013), in the art's order. */
export const singleElements=(groups:readonly (readonly string[])[])=>{const present=new Set(groups.flat());return ELEMENTS.filter(name=>present.has(name))};
/** The dual pairs among some type lists, each by the name of its official art, in source order. */
export function dualElements(groups:readonly (readonly string[])[]):string[] {
  return [...new Set(groups.filter(types=>types.length===2).map(elementName))]
    .sort((a,b)=>(typeAssets[a]?.typeId??0)-(typeAssets[b]?.typeId??0));
}
/** Filter choices for some type lists: the count filters, each element present, then dual pairs in source order. */
export function elementFilterOptions(groups:readonly (readonly string[])[]):ElementFilterOption[] {
  const duals=dualElements(groups);
  return [
    ...[ALL_ELEMENTS,SINGLE_ELEMENTS,DUAL_ELEMENTS].map(value=>({value,label:value,kind:'count' as const})),
    ...[...new Set(groups.flat())].map(value=>({value,label:value,kind:'single' as const})),
    ...duals.map(value=>({value,label:elementParts(value).join('·'),kind:'dual' as const})),
  ];
}
