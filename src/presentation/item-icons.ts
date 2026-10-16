import source from './item-icon-assets.json';

export interface ItemIconAsset {
  src: string;
  original: boolean;
  sha256?: string;
  fallback?: string;
  fallbackLabel?: string;
}
const assets=source as Record<string,ItemIconAsset>;
const fallbackNames:Record<string,string>={capsule:'胶囊分类图标',battle:'补给分类图标',status:'解除异常分类图标',raising:'培养道具分类图标',essence:'精元分类图标',fusion:'元神珠分类图标',ability:'能力刻印分类图标',skill:'技能刻印分类图标',other:'道具分类图标'};

export function getItemIconFallback(id:string|number,kind?:string,engraving=false):ItemIconAsset {
  const key=String(id);
  const category=engraving?(key.startsWith('1')?'ability':'skill'):
    key==='item_status_cure'?'status':key.startsWith('fusion_bead_')?'fusion':
    key.startsWith('essence_')?'essence':kind&&kind in fallbackNames?kind:'other';
  return {src:`/item-icons/fallback/${category}.svg`,original:false,fallback:category,fallbackLabel:fallbackNames[category]};
}

/** Exact identities use official artwork; unknown identities have explicit category fallbacks. */
export function getItemIcon(id:string|number,kind?:string,engraving=false):ItemIconAsset {
  const asset=assets[engraving?`engraving:${id}`:String(id)];
  if(!asset)return getItemIconFallback(id,kind,engraving);
  return asset.original?asset:{...asset,fallbackLabel:fallbackNames[asset.fallback??'other']};
}
