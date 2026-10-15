import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {getLayoutZoom} from '../presentation/game-display';

export default function GameWindow({title,children,onClose,compact=false}:{title:string;children:ReactNode;onClose:()=>void;compact?:boolean}) {
  const ref=useRef<HTMLElement>(null);
  const [position,setPosition]=useState<{x:number;y:number}|null>(null);
 const drag=useRef<{x:number;y:number;left:number;top:number;zoom:number}|null>(null);
  useEffect(()=>{
    const box=ref.current!,parent=box.parentElement!;
    const observer=new ResizeObserver(()=>setPosition(old=>{
      if(!old)return old;
      const x=Math.max(0,Math.min(parent.clientWidth-box.offsetWidth,old.x)),y=Math.max(0,Math.min(parent.clientHeight-box.offsetHeight,old.y));
      return x===old.x&&y===old.y?old:{x,y};
    }));observer.observe(parent);return()=>observer.disconnect();
  },[]);
  function begin(event:PointerEvent<HTMLElement>) {
    if((event.target as HTMLElement).closest('button'))return;
    const box=ref.current!.getBoundingClientRect(),parent=ref.current!.parentElement!.getBoundingClientRect(),zoom=getLayoutZoom(ref.current!);
    drag.current={x:event.clientX,y:event.clientY,left:(box.left-parent.left)/zoom,top:(box.top-parent.top)/zoom,zoom};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLElement>) {
    if(!drag.current)return;
    const parent=ref.current!.parentElement!,box=ref.current!;
    setPosition({x:Math.max(0,Math.min(parent.clientWidth-box.offsetWidth,drag.current.left+(event.clientX-drag.current.x)/drag.current.zoom)),y:Math.max(0,Math.min(parent.clientHeight-box.offsetHeight,drag.current.top+(event.clientY-drag.current.y)/drag.current.zoom))});
  }
  return <section ref={ref} className={`scene-window ${compact?'compact':''}`} role="dialog" aria-label={title} style={position?{left:position.x,top:position.y,transform:'none'}:undefined}>
    <header className="window-titlebar" onPointerDown={begin} onPointerMove={move} onPointerUp={()=>drag.current=null} onPointerCancel={()=>drag.current=null}><h2>{title}</h2><button aria-label={`关闭${title}`} onClick={onClose}><img src="/ui/classic/close.svg" alt="" draggable={false}/></button></header>
    <div className="window-body">{children}</div>
  </section>;
}
