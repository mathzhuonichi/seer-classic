import {useEffect,useRef,useState,type ReactNode,type PointerEvent} from 'react';
import {clampWindow,dragWindow,getLayoutZoom,startWindowDrag,type WindowDrag,type WindowPosition} from '../presentation/game-display.ts';

export default function GameWindow({title,children,onClose,compact=false}:{title:string;children:ReactNode;onClose:()=>void;compact?:boolean}) {
  const ref=useRef<HTMLElement>(null);
  const [position,setPosition]=useState<WindowPosition|null>(null);
  const drag=useRef<WindowDrag|null>(null);
  useEffect(()=>{
    const box=ref.current!,parent=box.parentElement!;
    const observer=new ResizeObserver(()=>setPosition(old=>old&&clampWindow(old,parent,box)));observer.observe(parent);return()=>observer.disconnect();
  },[]);
  function begin(event:PointerEvent<HTMLElement>) {
    if((event.target as HTMLElement).closest('button'))return;
    const box=ref.current!;
    drag.current=startWindowDrag(event,box.getBoundingClientRect(),box.parentElement!.getBoundingClientRect(),getLayoutZoom(box));
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLElement>) {
    if(drag.current)setPosition(dragWindow(drag.current,event,ref.current!.parentElement!,ref.current!));
  }
  const end=()=>{drag.current=null};
  return <section ref={ref} className={`scene-window ${compact?'compact':''}`} role="dialog" aria-label={title}
    style={position?{left:position.x,top:position.y,transform:'none'}:undefined}>
    <header className="window-titlebar" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <h2>{title}</h2><button aria-label={`关闭${title}`} onClick={onClose}><img src="/ui/classic/close.svg" alt="" draggable={false}/></button>
    </header>
    <div className="window-body">{children}</div>
  </section>;
}
