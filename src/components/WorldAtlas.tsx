import {useMemo,useState,type CSSProperties} from 'react';
import {WORLD_GALAXIES,WORLD_PLANETS,readWorldPreference,resolveWorldLocation,type WorldPlanet,type WorldRegion} from '../world';
import graphAssets from '../presentation/atlas-graph-assets.json';
import '../atlas.css';

export interface WorldDestination {planetId:string;regionId:string}
export interface WorldAtlasProps {onTravel:(destination:WorldDestination)=>void;currentPlanetId?:string;currentRegionId?:string}
type AtlasView={kind:'overview'}|{kind:'galaxy';galaxyId:string}|{kind:'planet';planetId:string};
type AtlasNode={id?:string;targetKind:'galaxy'|'planet'|'region'|'back';targetId?:string;mapId?:number;x:number;y:number;width:number;height:number;asset?:string;label?:string;drawLabel?:boolean;labelX?:number;labelY?:number;planetId?:string;regionId?:string};
type AtlasArtwork={asset:string;x:number;y:number;width:number;height:number};
type AtlasTitlePlate={x:number;y:number;width:number;height:number;fontSize?:number;color?:string};
type AtlasPage={width:number;height:number;background?:string;bg?:string;nodes:AtlasNode[];heading?:string;headingInArtwork?:boolean;decorations?:AtlasArtwork[];titleRect?:AtlasTitlePlate;titlePlate?:AtlasTitlePlate};
type GraphAssets={pages:Record<string,AtlasPage>;backArrow?:string};
const graphics=graphAssets as unknown as GraphAssets;

function nodePlanet(node:AtlasNode):WorldPlanet|undefined{
 return WORLD_PLANETS.find(planet=>node.planetId===planet.id)
  ??WORLD_PLANETS.find(planet=>node.targetId===planet.id)
  ??(node.mapId===undefined?undefined:WORLD_PLANETS.find(planet=>node.mapId===planet.originalMapId));
}
function nodeRegion(node:AtlasNode,planet:WorldPlanet):WorldRegion|undefined{
 return planet.regions.find(region=>node.regionId===region.id)
  ??planet.regions.find(region=>node.targetId===region.id)
  ??(node.mapId===undefined?undefined:planet.regions.find(region=>node.mapId===region.originalMapId));
}

export default function WorldAtlas({onTravel,currentPlanetId,currentRegionId}:WorldAtlasProps){
 const [initial]=useState(()=>{const preference=currentPlanetId?{planetId:currentPlanetId,regionId:currentRegionId??''}:readWorldPreference();return resolveWorldLocation(preference.planetId,preference.regionId)});
 const [view,setView]=useState<AtlasView>({kind:'overview'});
 const planet=view.kind==='planet'?WORLD_PLANETS.find(entry=>entry.id===view.planetId):undefined;
 const galaxy=view.kind==='galaxy'?WORLD_GALAXIES.find(entry=>entry.id===view.galaxyId):undefined;
 const planetPageKey=planet&&graphics.pages[`planet-${planet.id}`]?`planet-${planet.id}`:`planet-${planet?.originalMapId}`;
 const pageKey=view.kind==='overview'?'overview':view.kind==='galaxy'?`galaxy-${view.galaxyId}`:planetPageKey;
 const page=graphics.pages[pageKey];
 const titlePlate=page?.titleRect??page?.titlePlate;
 const heading=view.kind==='overview'?'宇宙航行图':view.kind==='galaxy'?galaxy?.name:planet?.name;
 const current=useMemo(()=>resolveWorldLocation(currentPlanetId??initial.planet.id,currentRegionId??initial.region.id),[currentPlanetId,currentRegionId,initial]);

 function enterPlanet(destination:WorldPlanet){
  if(destination.regions.length===1){onTravel({planetId:destination.id,regionId:destination.regions[0].id});return;}
  setView({kind:'planet',planetId:destination.id});
 }
 function back(){
  if(view.kind==='planet'&&planet?.galaxyId!=='ship'){setView({kind:'galaxy',galaxyId:planet?.galaxyId??WORLD_GALAXIES[0].id});return;}
  setView({kind:'overview'});
 }
 function nodeAction(node:AtlasNode):{label:string;current:boolean;activate:()=>void}|undefined{
  if(node.targetKind==='back')return {label:view.kind==='planet'&&planet?.galaxyId!=='ship'?'返回星系地图':'返回宇宙地图',current:false,activate:back};
  if(node.targetKind==='galaxy'){
   const destination=WORLD_GALAXIES.find(entry=>entry.id===node.targetId||entry.originalId===node.mapId);
   if(!destination)return;
   return {label:`进入${destination.name}`,current:current.planet.galaxyId===destination.id,activate:()=>setView({kind:'galaxy',galaxyId:destination.id})};
  }
  if(node.targetKind==='planet'){
   const destination=nodePlanet(node);if(!destination)return;
   return {label:destination.regions.length===1?`前往${destination.regions[0].name}`:`查看${destination.name}登陆地点`,current:current.planet.id===destination.id,activate:()=>enterPlanet(destination)};
  }
  const destination=node.planetId?nodePlanet(node):planet??nodePlanet(node);if(!destination)return;
  const landing=nodeRegion(node,destination);if(!landing)return;
  return {label:`前往${landing.name}`,current:current.planet.id===destination.id&&current.region.id===landing.id,activate:()=>onTravel({planetId:destination.id,regionId:landing.id})};
 }

 return <section className="galaxy-atlas graphical-atlas" aria-label="星系航行地图">
  <header className={`atlas-graph-heading${page?.headingInArtwork?' atlas-heading-in-art':''}${page?.nodes.some(node=>node.targetKind==='back')?' atlas-back-in-art':''}`}>
   {view.kind!=='overview'&&!page?.nodes.some(node=>node.targetKind==='back')&&<button className="atlas-return" onClick={back} aria-label={view.kind==='planet'&&planet?.galaxyId!=='ship'?'返回星系地图':'返回宇宙地图'}>{graphics.backArrow?<img src={graphics.backArrow} alt=""/>:<span aria-hidden="true">←</span>}<span>返回</span></button>}
   <h3>{heading}</h3>
  </header>
  <div className="atlas-graph-stage">
   {page?<div className="atlas-native-diagram" style={{'--diagram-ratio':page.width/page.height,aspectRatio:`${page.width} / ${page.height}`} as CSSProperties} aria-label={`${heading}图形地图`}>
    <img className="atlas-diagram-art" src={page.background??page.bg} alt="" draggable={false}/>
    {page.decorations?.map((art,index)=><img key={`${art.asset}-${index}`} className="atlas-native-decoration" src={art.asset} alt="" draggable={false} style={{left:`${art.x/page.width*100}%`,top:`${art.y/page.height*100}%`,width:`${art.width/page.width*100}%`,height:`${art.height/page.height*100}%`}}/>)}
    {titlePlate&&<span className="atlas-native-title" style={{left:`${titlePlate.x/page.width*100}%`,top:`${titlePlate.y/page.height*100}%`,width:`${titlePlate.width/page.width*100}%`,height:`${titlePlate.height/page.height*100}%`,fontSize:`${(titlePlate.fontSize??14)/page.width*100}cqw`,color:titlePlate.color??'#fff'}}>{heading}</span>}
    {page.nodes.map((node,index)=>{const action=nodeAction(node);if(!action)return null;return <button key={node.id??`${node.targetKind}-${node.targetId??node.mapId??index}`} className={`atlas-native-node${action.current?' current':''}`} aria-label={action.label} aria-current={action.current?'location':undefined} title={action.label} onClick={action.activate} style={{left:`${node.x/page.width*100}%`,top:`${node.y/page.height*100}%`,width:`${node.width/page.width*100}%`,height:`${node.height/page.height*100}%`}}>
     {node.asset&&<img src={node.asset} alt="" draggable={false}/>}<span className="atlas-node-focus" aria-hidden="true"/>
     {node.drawLabel&&<span className="atlas-native-label" style={node.labelX!==undefined&&node.labelY!==undefined?{left:`${(node.labelX-node.x)/node.width*100}%`,top:`${(node.labelY-node.y)/node.height*100}%`}:undefined}>{node.label??action.label.replace(/^(进入|前往|查看)/,'').replace(/登陆地点$/,'')}</span>}
    </button>})}
   </div>:<p className="atlas-source-unavailable" role="status">地图图形正在准备中。</p>}
  </div>
 </section>;
}
