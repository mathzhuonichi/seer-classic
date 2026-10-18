import {useState,type CSSProperties} from 'react';
import {WORLD_GALAXIES,WORLD_PLANETS,readWorldPreference,resolveWorldLocation,type WorldLocationId} from '../world.ts';
import {ATLAS_GRAPHICS as graphics,atlasNodeAction,atlasPageKey,backLabel,backView,pageBox,type AtlasNodeAction,type AtlasView} from '../presentation/atlas.ts';
import '../atlas.css';

export interface WorldAtlasProps {onTravel:(destination:WorldLocationId)=>void}

export default function WorldAtlas({onTravel}:WorldAtlasProps){
 const [current]=useState(()=>{const preference=readWorldPreference();return resolveWorldLocation(preference.planetId,preference.regionId)});
 const [view,setView]=useState<AtlasView>({kind:'overview'});
 const planet=view.kind==='planet'?WORLD_PLANETS.find(entry=>entry.id===view.planetId):undefined;
 const galaxy=view.kind==='galaxy'?WORLD_GALAXIES.find(entry=>entry.id===view.galaxyId):undefined;
 const page=graphics.pages[atlasPageKey(view,planet)];
 const titlePlate=page?.titleRect??page?.titlePlate;
 const heading=view.kind==='overview'?'宇宙航行图':view.kind==='galaxy'?galaxy?.name:planet?.name;
 const backInArt=page?.nodes.some(node=>node.targetKind==='back');
 function activate({target}:AtlasNodeAction){
  if(target.kind==='back')setView(backView(view,planet));
  else if(target.kind==='view')setView(target.view);
  else onTravel(target.destination);
 }

 return <section className="galaxy-atlas graphical-atlas" aria-label="星系航行地图">
  <header className={`atlas-graph-heading${page?.headingInArtwork?' atlas-heading-in-art':''}${backInArt?' atlas-back-in-art':''}`}>
   {view.kind!=='overview'&&!backInArt&&<button className="atlas-return" onClick={()=>setView(backView(view,planet))} aria-label={backLabel(view,planet)}>{graphics.backArrow?<img src={graphics.backArrow} alt=""/>:<span aria-hidden="true">←</span>}<span>返回</span></button>}
   <h3>{heading}</h3>
  </header>
  <div className="atlas-graph-stage">
   {page?<div className="atlas-native-diagram" style={{'--diagram-ratio':page.width/page.height,aspectRatio:`${page.width} / ${page.height}`} as CSSProperties} aria-label={`${heading}图形地图`}>
    <img className="atlas-diagram-art" src={page.background??page.bg} alt="" draggable={false}/>
    {page.decorations?.map((art,index)=><img key={`${art.asset}-${index}`} className="atlas-native-decoration" src={art.asset} alt="" draggable={false} style={pageBox(art,page)}/>)}
    {titlePlate&&<span className="atlas-native-title" style={{...pageBox(titlePlate,page),fontSize:`${(titlePlate.fontSize??14)/page.width*100}cqw`,color:titlePlate.color??'#fff'}}>{heading}</span>}
    {page.nodes.map((node,index)=>{const action=atlasNodeAction(node,view,planet,current);if(!action)return null;return <button key={node.id??`${node.targetKind}-${node.targetId??node.mapId??index}`} className={`atlas-native-node${action.current?' current':''}`} aria-label={action.label} aria-current={action.current?'location':undefined} title={action.label} onClick={()=>activate(action)} style={pageBox(node,page)}>
     {node.asset&&<img src={node.asset} alt="" draggable={false}/>}<span className="atlas-node-focus" aria-hidden="true"/>
     {node.drawLabel&&<span className="atlas-native-label" style={node.labelX!==undefined&&node.labelY!==undefined?{left:`${(node.labelX-node.x)/node.width*100}%`,top:`${(node.labelY-node.y)/node.height*100}%`}:undefined}>{node.label??action.label.replace(/^(进入|前往|查看)/,'').replace(/登陆地点$/,'')}</span>}
    </button>})}
   </div>:<p className="atlas-source-unavailable" role="status">地图图形正在准备中。</p>}
  </div>
 </section>;
}
