import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {elementName,elementParts,typeAssets,type ElementTypes} from '../presentation/element-types.ts';
import {getLayoutZoom} from '../presentation/game-display.ts';
import './type-icon.css';

/** Original official button artwork, with a tooltip outside clipping card panels. */
export default function TypeIcon({ type, focusable = true }: { type: ElementTypes; focusable?: boolean }) {
  const name=elementName(type),parts=elementParts(type);
  const asset=typeAssets[name];
  const label=name==='属性'?'属性技能':parts.length>1?`${parts.join('·')}属性（双属性）`:`${name}属性`;
  const icon = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const hovered = useRef(false), focused = useRef(false);
  const tooltipId = useId();
  const [insideButton, setInsideButton] = useState(false);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; below: boolean; zoom:number }>();

  function placeTooltip() {
    if (!icon.current) return;
    const anchor = icon.current.getBoundingClientRect();
    const zoom=getLayoutZoom(icon.current),margin=8*zoom;
    const width = (tooltip.current?.offsetWidth ?? Math.max(54, label.length * 12 + 20))*zoom;
    const height = (tooltip.current?.offsetHeight ?? 30)*zoom;
    const half = Math.min(width / 2, (window.innerWidth - 2*margin) / 2);
    const below = anchor.top < height + 14*zoom;
    setPosition({ left: Math.max(half + margin, Math.min(window.innerWidth - half - margin, anchor.left + anchor.width / 2))/zoom,
      top: (below ? anchor.bottom + 7*zoom : anchor.top - 7*zoom)/zoom, below,zoom });
  }
  function show() { placeTooltip(); setVisible(true); }
  function synchronize() { if (hovered.current || focused.current) show(); else setVisible(false); }

  useLayoutEffect(() => {
    const parent = icon.current?.closest('button');
    setInsideButton(!!parent);
    if (!parent) return;
    const focus = () => { focused.current = true; show(); };
    const blur = () => { focused.current = false; synchronize(); };
    parent.addEventListener('focus', focus);
    parent.addEventListener('blur', blur);
    if (document.activeElement === parent) focus();
    return () => { parent.removeEventListener('focus', focus); parent.removeEventListener('blur', blur); };
  }, [label]);
  useLayoutEffect(() => { if (visible) placeTooltip(); }, [visible, label]);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setVisible(false); };
    window.addEventListener('resize', placeTooltip);
    window.addEventListener('scroll', placeTooltip, true);
    window.addEventListener('keydown', dismiss);
    const scaledHost=icon.current?.closest('.game-shell,.icon-type-menu');
    const observer=new MutationObserver(placeTooltip);
    if(scaledHost)observer.observe(scaledHost,{attributes:true,attributeFilter:['style']});
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', placeTooltip);
      window.removeEventListener('scroll', placeTooltip, true);
      window.removeEventListener('keydown', dismiss);
    };
  }, [visible, label]);

  return <>
    <span ref={icon} className={`battle-type-icon${asset ? '' : ' is-unavailable'}`} role="img" aria-label={label}
      aria-describedby={visible ? tooltipId : undefined} tabIndex={focusable && !insideButton ? 0 : undefined}
      onMouseEnter={() => { hovered.current = true; show(); }}
      onMouseLeave={() => { hovered.current = false; synchronize(); }}
      onFocus={() => { focused.current = true; show(); }}
      onBlur={() => { focused.current = false; synchronize(); }}>
      {asset ? <img src={`${asset.path}?v=${asset.sha256.slice(0, 12)}`} alt="" draggable={false}/> : <span>{name}</span>}
    </span>
    {visible && position && createPortal(<span ref={tooltip} id={tooltipId} role="tooltip"
      className={`battle-type-tooltip${position.below ? ' is-below' : ''}`}
      style={{ left: position.left, top: position.top,zoom:position.zoom,maxWidth:`calc(${100/position.zoom}vw - 16px)` }}>{label}</span>, document.body)}
  </>;
}
