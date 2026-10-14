/** Verify navigation coverage and source-resource geometry without touching a game save. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

const root=process.cwd();
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {WORLD_GALAXIES,WORLD_PLANETS}=await server.ssrLoadModule('/src/world.ts');
  const manifest=JSON.parse(fs.readFileSync('src/presentation/atlas-graph-assets.json','utf8'));
  const pages=manifest.pages;
  // Match the component's explicit canonical-ID priority before source map-ID fallback.
  const planetFor=node=>WORLD_PLANETS.find(p=>node.planetId===p.id)
    ??WORLD_PLANETS.find(p=>node.targetId===p.id)
    ??(node.mapId===undefined?undefined:WORLD_PLANETS.find(p=>node.mapId===p.originalMapId));
  const regionFor=(node,planet)=>planet.regions.find(r=>node.regionId===r.id)
    ??planet.regions.find(r=>node.targetId===r.id)
    ??(node.mapId===undefined?undefined:planet.regions.find(r=>node.mapId===r.originalMapId));
  const adaptedHotspotOverlaps=[];
  let auditedAdaptedPairs=0;
  for(const [key,page] of Object.entries(pages)) {
    for(let i=0;i<page.nodes.length;i++) {
      for(let j=i+1;j<page.nodes.length;j++) {
        const a=page.nodes[i],b=page.nodes[j];
        // Original native/native overlaps may be intentional; introduced controls must be clear.
        if(!a.adaptation&&!b.adaptation&&!a.positionKind&&!b.positionKind)continue;
        auditedAdaptedPairs++;
        const width=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
        const height=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
        if(width>0.5&&height>0.5) {
          adaptedHotspotOverlaps.push({page:key,a:a.targetId??a.targetKind,b:b.targetId??b.targetKind,width,height});
        }
      }
    }
  }
  assert.deepEqual(adaptedHotspotOverlaps,[],`Adapted hotspot overlaps: ${JSON.stringify(adaptedHotspotOverlaps)}`);

  const visited=new Set(),landings=new Set(),queue=[{key:'overview'}],assets=new Set();
  if(manifest.backArrow)assets.add(manifest.backArrow);
  let nodeCount=0,decorationCount=0,titleCount=0;
  function assertBounds(rect,page,description) {
    assert(rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0
      &&rect.x+rect.width<=page.width+1&&rect.y+rect.height<=page.height+1,
      `Invalid source viewport bounds: ${description}`);
  }
  while(queue.length) {
    const entry=queue.shift();
    if(visited.has(entry.key))continue;
    visited.add(entry.key);
    const page=pages[entry.key];
    assert(page,`Missing reachable page ${entry.key}`);
    assert(page.width>0&&page.height>0,`Invalid page dimensions ${entry.key}`);
    assets.add(page.background??page.bg);
    for(const art of page.decorations??[]) {
      decorationCount++;
      assets.add(art.asset);
      assertBounds(art,page,`${entry.key} decoration`);
    }
    const title=page.titleRect??page.titlePlate;
    if(title) {
      titleCount++;
      assertBounds(title,page,`${entry.key} title`);
    }
    for(const node of page.nodes) {
      nodeCount++;
      assertBounds(node,page,`${entry.key}/${node.targetId??node.mapId??node.targetKind}`);
      if(node.asset)assets.add(node.asset);
      if(node.drawLabel) {
        if(node.labelX!==undefined)assert(node.labelX>=0&&node.labelX<=page.width,`Label anchor outside ${entry.key}`);
        if(node.labelY!==undefined)assert(node.labelY>=0&&node.labelY<=page.height,`Label anchor outside ${entry.key}`);
      }
      if(node.targetKind==='back')continue;
      if(node.targetKind==='galaxy') {
        const galaxy=WORLD_GALAXIES.find(g=>g.id===node.targetId||g.originalId===node.mapId);
        assert(galaxy,`Unknown galaxy node ${node.targetId??node.mapId}`);
        queue.push({key:`galaxy-${galaxy.id}`});
      } else if(node.targetKind==='planet') {
        const planet=planetFor(node);
        assert(planet,`Unknown planet node ${node.targetId??node.mapId}`);
        if(planet.regions.length===1) {
          landings.add(`${planet.id}/${planet.regions[0].id}`);
        } else {
          queue.push({key:pages[`planet-${planet.id}`]?`planet-${planet.id}`:`planet-${planet.originalMapId}`,planet});
        }
      } else {
        const planet=node.planetId?planetFor(node):entry.planet??planetFor(node);
        assert(planet,`Missing region parent ${entry.key}`);
        const region=regionFor(node,planet);
        assert(region,`Unknown region node ${entry.key}/${node.targetId??node.mapId}`);
        landings.add(`${planet.id}/${region.id}`);
      }
    }
  }
  const missing=WORLD_PLANETS.flatMap(p=>p.regions.map(r=>`${p.id}/${r.id}`)).filter(id=>!landings.has(id));
  assert.deepEqual(missing,[],`Unreachable landing regions: ${missing.join(', ')}`);
  for(const asset of assets) {
    assert(asset?.startsWith('/ui/classic/'),`Unexpected source artwork path ${asset}`);
    assert(fs.existsSync(root+'/public'+asset),`Missing source artwork ${asset}`);
  }
  const report={pages:visited.size,nodes:nodeCount,destinations:WORLD_PLANETS.length,
    landingLeaves:landings.size,assets:assets.size,decorations:decorationCount,titles:titleCount,
    auditedAdaptedPairs,adaptedHotspotOverlaps,missing};
  fs.mkdirSync('artifacts/ui-v28',{recursive:true});
  fs.writeFileSync('artifacts/ui-v28/atlas-coverage.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
} finally {
  await server.close();
}
