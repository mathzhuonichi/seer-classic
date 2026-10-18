/** Add source-backed habitat leaves without replacing recovered native diagrams. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const target = path.join(root, 'src/features/world/atlas-graph-assets.json');
const definitions = JSON.parse(fs.readFileSync(path.join(root, 'data/habitat-regions.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
// These supplemental anchors were checked against the recovered diagrams.
// Helka already draws the two labels; keep them and only bind their hit areas.
const native = {
  34: { x: 461, y: 172, width: 105, height: 39, labelInArtwork: true },
  675: { x: 495, y: 283, width: 101, height: 38, labelInArtwork: true },
  478: { x: 59, y: 145, width: 34, height: 34 },
  689: { x: 386, y: 198, width: 34, height: 34 },
  727: { x: 201, y: 59, width: 34, height: 34 },
  38: { x: 488, y: 278, width: 34, height: 34 },
};
const collide = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const footprint = node => node.drawLabel
  ? { x: (node.labelX ?? node.x + node.width / 2) - 85, y: node.y - 8, width: 170, height: node.height + 42 }
  : { x: node.x - 8, y: node.y - 8, width: node.width + 16, height: node.height + 16 };

try {
  const { WORLD_PLANETS } = await server.ssrLoadModule('/src/domain/world/world.ts');
  for (const [key, page] of Object.entries(manifest.pages)) {
    if (page.habitatExpansion) delete manifest.pages[key];
    else page.nodes = page.nodes.filter(node => !node.habitatExpansion);
  }
  for (const planetId of new Set(definitions.regions.map(region => region.planetId))) {
    const planet = WORLD_PLANETS.find(candidate => candidate.id === planetId);
    const key = manifest.pages[`planet-${planet.id}`] ? `planet-${planet.id}` : `planet-${planet.originalMapId}`;
    let page = manifest.pages[key];
    if (!page) {
      const asset = `/ui/classic/maps/planet-${planet.originalMapId}.png`;
      const bytes = fs.readFileSync(path.join(root, 'public', asset));
      const width = bytes.readUInt32BE(16) * .9, height = bytes.readUInt32BE(20) * .9;
      page = manifest.pages[key] = {
        width: 960, height: 560, background: '/ui/classic/maps/space-backdrop.png',
        decorations: [{ asset, x: (960 - width) / 2, y: (560 - height) / 2, width, height }],
        nodes: [], habitatExpansion: true,
        layoutKind: 'Remake composition using the recovered original planet icon and GO control; leaf locations are authored navigation anchors.',
      };
    }
    const additions = planet.regions.filter(region => !page.nodes.some(node => node.targetId === region.id || node.regionId === region.id));
    for (const region of additions) {
      let placement = native[region.originalMapId];
      if (!placement) {
        const blocked = [...page.nodes.map(footprint), ...(page.decorations ?? []), ...(page.titlePlate ? [page.titlePlate] : [])];
        const anchors = [[.17,.24],[.17,.64],[.77,.22],[.70,.65],[.44,.75],[.44,.15]];
        placement = anchors.map(([x, y]) => ({ x: x * page.width, y: y * page.height, width: 44, height: 44 }))
          .find(candidate => !blocked.some(rect => collide(footprint({ ...candidate, drawLabel: true }), rect)));
        if (!placement) throw new Error(`No clear habitat navigation anchor: ${planet.id}/${region.id}`);
      }
      const { labelInArtwork, ...rectangle } = placement;
      const node = {
        targetKind: 'region', targetId: region.id, planetId: planet.id, mapId: region.originalMapId,
        ...rectangle, habitatExpansion: true,
        adaptation: labelInArtwork
          ? 'A hit area manually aligned to the existing label in the recovered original diagram.'
          : 'Original GO artwork at an authored navigation anchor; the source map and parent are established by habitat-regions.json.',
      };
      if (!labelInArtwork) Object.assign(node, {
        asset: '/ui/classic/maps/region-go.png', drawLabel: true, label: region.name,
        labelX: placement.x + placement.width / 2, labelY: placement.y + placement.height + 7,
      });
      page.nodes.push(node);
    }
  }
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ regions: definitions.regions.length, addedLeaves: Object.values(manifest.pages).flatMap(page => page.nodes).filter(node => node.habitatExpansion).length }));
} finally {
  await server.close();
}
