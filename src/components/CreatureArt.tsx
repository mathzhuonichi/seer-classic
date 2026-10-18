import {creatureArtStyle, creatureIdleTiming, getCreatureArt} from '../presentation/creature-art.ts';
import './creature-art.css';

interface CreatureArtProps {species:number;name:string;size?:number;className?:string;fill?:number;scaleByStage?:boolean;verticalAlign?:'ground'|'center'}

/** A species' art in a square box, framed by its measured silhouette and gently breathing. */
export function CreatureArt({species,name,size,className='',fill=.9,scaleByStage,verticalAlign}:CreatureArtProps) {
  const box={position:'relative',width:size??'100%',height:size??'100%',aspectRatio:'1',flexShrink:0,overflow:'visible'} as const;
  return <div className={`creature-art ${className}`} data-species={species} style={box}>
    <div className="creature-art-idle" style={creatureIdleTiming(species)}>
      <img src={getCreatureArt(species).src} alt={name} draggable={false} style={creatureArtStyle(species,size,{fill,scaleByStage,verticalAlign})}/>
    </div>
  </div>;
}
