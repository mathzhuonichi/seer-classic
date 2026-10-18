import source from './item-icon-assets.json';

export interface ItemIconAsset {
  src: string;
  original: boolean;
  sha256?: string;
  fallback?: string;
  fallbackLabel?: string;
}
const assets=source as Record<string,ItemIconAsset>;
const fallbackNames:Record<string,string>={
  capsule:'胶囊分类图标',battle:'补给分类图标',status:'解除异常分类图标',raising:'培养道具分类图标',essence:'精元分类图标',fusion:'元神珠分类图标',
  ability:'能力刻印分类图标',skill:'技能刻印分类图标',other:'道具分类图标',
};
const fallbacks=new Map(Object.entries(fallbackNames).map(([category,fallbackLabel])=>
  [category,{src:`/item-icons/fallback/${category}.svg`,original:false,fallback:category,fallbackLabel} as ItemIconAsset]));

/** Ability engraving ids start with 1, skill engraving ids with 2. */
function fallbackCategory(key:string,kind?:string,engraving=false):string {
  if(engraving)return key.startsWith('1')?'ability':'skill';
  if(key==='item_status_cure')return 'status';
  if(key.startsWith('fusion_bead_'))return 'fusion';
  if(key.startsWith('essence_'))return 'essence';
  return kind&&Object.hasOwn(fallbackNames,kind)?kind:'other';
}

export function getItemIconFallback(id:string|number,kind?:string,engraving=false):ItemIconAsset {
  return fallbacks.get(fallbackCategory(String(id),kind,engraving))!;
}

/** Exact identities use official artwork; unknown identities have explicit category fallbacks. */
export function getItemIcon(id:string|number,kind?:string,engraving=false):ItemIconAsset {
  const asset=assets[engraving?`engraving:${id}`:String(id)];
  if(!asset)return getItemIconFallback(id,kind,engraving);
  return asset.original?asset:{...asset,fallbackLabel:fallbackNames[asset.fallback??'other']};
}
