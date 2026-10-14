import {creatureArtStyle, getCreatureArt} from '../presentation/creature-art';
import './creature-art.css';

export function CreatureArt({species,name,size,className='',fill=.9,scaleByStage,verticalAlign}: {species:number;name:string;size?:number;className?:string;fill?:number;scaleByStage?:boolean;verticalAlign?:'ground'|'center'}) {
  const art=getCreatureArt(species);
  return <div className={`creature-art ${className}`} data-species={species} style={{position:'relative',width:size??'100%',height:size??'100%',aspectRatio:'1',flexShrink:0,overflow:'visible'}}>
    <div className="creature-art-idle" style={{animationDelay:`-${species%11*.27/1.5}s`,animationDuration:`${(3.6+species%4*.2)/1.5}s`}}>
      <img src={art.src} alt={name} draggable={false} style={creatureArtStyle(species,size,{fill,scaleByStage,verticalAlign})}/>
    </div>
  </div>;
}
