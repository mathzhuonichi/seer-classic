/** Atlas navigation coverage and source-resource geometry, following the hotspots exactly as WorldAtlas does. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {root,suite,withSsr} from './_harness.mjs';

await withSsr('graphical-atlas',async load=>{
  const t=suite('graphical-atlas'),{check}=t;
  const [{WORLD_PLANETS,resolveWorldLocation},atlas]=await Promise.all(['/src/domain/world/world.ts','/src/features/world/atlas.ts'].map(load));
  const {pages,backArrow}=atlas.ATLAS_GRAPHICS,report={};
  check('Introduced hotspots never overlap another hotspot on the same page',()=>{
    const overlaps=[];let audited=0;
    for(const [key,page] of Object.entries(pages))for(let i=0;i<page.nodes.length;i++)for(let j=i+1;j<page.nodes.length;j++){
      const a=page.nodes[i],b=page.nodes[j];
      // Original native/native overlaps may be intentional; introduced controls must be clear.
      if(!a.adaptation&&!b.adaptation&&!a.positionKind&&!b.positionKind)continue;
      audited++;
      const width=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),height=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
      if(width>0.5&&height>0.5)overlaps.push({page:key,a:a.targetId??a.targetKind,b:b.targetId??b.targetKind,width,height});
    }
    assert.deepEqual(overlaps,[]);report.auditedAdaptedPairs=audited;
  });
  const visited=new Set(),landings=new Set(),assets=new Set(backArrow?[backArrow]:[]);
  const inBounds=(rect,page,description)=>assert(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0
    &&rect.x+rect.width<=page.width+1&&rect.y+rect.height<=page.height+1,`Invalid source viewport bounds: ${description}`);
  check('Every page reachable from the overview has valid artwork geometry and live hotspots',()=>{
    const current=resolveWorldLocation('klose','plain'),queue=[{kind:'overview'}];
    let nodes=0,decorations=0,titles=0;
    while(queue.length){
      const view=queue.shift(),planet=view.kind==='planet'?WORLD_PLANETS.find(entry=>entry.id===view.planetId):undefined,key=atlas.atlasPageKey(view,planet);
      if(visited.has(key))continue;
      visited.add(key);
      const page=pages[key];
      assert(page,`Missing reachable page ${key}`);assert(page.width>0&&page.height>0,`Invalid page dimensions ${key}`);
      assets.add(page.background??page.bg);
      for(const art of page.decorations??[]){decorations++;assets.add(art.asset);inBounds(art,page,`${key} decoration`);}
      const title=page.titleRect??page.titlePlate;
      if(title){titles++;inBounds(title,page,`${key} title`);}
      for(const node of page.nodes){
        nodes++;inBounds(node,page,`${key}/${node.targetId??node.mapId??node.targetKind}`);
        if(node.asset)assets.add(node.asset);
        if(node.drawLabel){
          if(node.labelX!==undefined)assert(node.labelX>=0&&node.labelX<=page.width,`Label anchor outside ${key}`);
          if(node.labelY!==undefined)assert(node.labelY>=0&&node.labelY<=page.height,`Label anchor outside ${key}`);
        }
        const action=atlas.atlasNodeAction(node,view,planet,current);
        assert(action,`Dead hotspot ${key}/${node.targetKind}:${node.targetId??node.mapId}`);
        if(action.target.kind==='view')queue.push(action.target.view);
        else if(action.target.kind==='travel'){const {planetId,regionId}=action.target.destination;landings.add(`${planetId}/${regionId}`);}
      }
    }
    Object.assign(report,{pages:visited.size,nodes,decorations,titles});
  });
  check('Every landing region is reachable through the graphical atlas',()=>{
    const missing=WORLD_PLANETS.flatMap(p=>p.regions.map(r=>`${p.id}/${r.id}`)).filter(id=>!landings.has(id));
    assert.deepEqual(missing,[],`Unreachable landing regions: ${missing.join(', ')}`);
  });
  check('A planet\'s landings have distinct names, and each drawn habitat label is its landing\'s name',()=>{
    for(const planet of WORLD_PLANETS){const names=planet.regions.map(region=>region.name);assert.equal(new Set(names).size,names.length,planet.id);}
    for(const node of Object.values(pages).flatMap(page=>page.nodes).filter(node=>node.habitatExpansion&&node.drawLabel)){
      const region=WORLD_PLANETS.find(planet=>planet.id===node.planetId)?.regions.find(entry=>entry.id===node.targetId);
      assert.equal(node.label,region?.name,`${node.planetId}/${node.targetId}`);
    }
  });
  check('All atlas artwork is shipped under /ui/classic/',()=>{
    for(const asset of assets){
      assert(asset?.startsWith('/ui/classic/'),`Unexpected source artwork path ${asset}`);
      assert(fs.existsSync(path.join(root,'public',asset)),`Missing source artwork ${asset}`);
    }
  });
  t.finish({...report,destinations:WORLD_PLANETS.length,landingLeaves:landings.size,assets:assets.size});
});
