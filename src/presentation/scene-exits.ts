import type { WorldPlanet, WorldRegion } from '../world';
import type { ScenePoint } from './map-presentation';

export type SceneExitFacing = 'left' | 'right' | 'up' | 'down';
export interface SceneExit {
  id: string;
  targetRegionId: string;
  /** Percent coordinates in the displayed background's natural frame. */
  anchor: ScenePoint;
  facing: SceneExitFacing;
  caption: string;
  fullName: string;
  ariaLabel: string;
  /** Arrival position in the target scene, independent of its floor polygon. */
  entry: ScenePoint;
  /** Authored connections preserve access where the recovered route is incomplete. */
  source: 'official' | 'authored';
  originalMapId?: number;
  targetOriginalMapId?: number;
}
type OriginalRoute = readonly [targetMapId: number, x: number, y: number, facing: SceneExitFacing];
/**
 * MapConfig symbol155 supplies target IDs; first-frame official Flash hit symbols
 * supply stage positions. Coordinates are projected onto each shipped image's
 * natural dimensions. Cardinal arrows use the nearest frame edge. Repeated
 * doorways to the same target are represented once. See scene-exits-v14.md.
 */
const originalRoutes: Record<number, readonly OriginalRoute[]> = {
  4:[[5,10.83,67.5,'left'],[1,82.92,81.07,'right']],
  10:[[11,14.17,76.07,'left']],
  11:[[10,92.81,51.69,'right'],[12,16.93,66.69,'left']],
  12:[[11,80.72,35.27,'right']],
  26:[[27,49.67,19.63,'up'],[25,88.32,57.13,'right']],
  27:[[26,73.54,58.86,'right']],
  20:[[21,26.04,89.82,'down']],
  21:[[20,77.08,30,'right'],[22,13.54,83.57,'left']],
  22:[[21,24.9,26.25,'left']],
  16:[[17,49.86,20.45,'up'],[15,11.32,53.3,'left']],
  17:[[16,8.85,21.43,'left']],
  15:[[16,83.95,29.42,'right']],
  32:[[31,23.12,80.98,'down']],
  30:[[31,20.21,26.43,'left']],
  31:[[30,21.43,80.17,'down'],[32,85.03,36.24,'right']],
  40:[[41,30.2,38.36,'left']],
  41:[[40,89.85,19.07,'right']],
  61:[[60,9.48,72.54,'left']],
  325:[[326,65.98,42.78,'right']],
  326:[[325,8.74,66.07,'left']],
  327:[[326,20.33,56.28,'left']],
  404:[[414,46.88,46.43,'up']],
  414:[[404,58.13,74.46,'down'],[423,31.77,61.61,'left']],
  423:[[414,13.02,26.07,'left']],
  436:[[435,11.46,34.82,'left']],
  437:[[438,78.12,43.75,'right']],
  438:[[437,8.33,25,'left']],
  46:[[106,12.09,63.57,'left']],
  55:[[54,56.25,85.71,'down']],
  57:[[58,30.85,30.25,'up']],
  58:[[57,35.83,78.34,'down']],
  51:[[53,29.64,34.16,'left']],
  53:[[51,10.94,86.6,'left']],
  314:[[315,90.65,50,'right']],
  315:[[314,26.67,27.86,'left']],
  464:[[463,27.81,49.38,'left']],
  463:[[464,79.47,64.54,'right']],
  429:[[430,73.96,67.86,'right']],
  430:[[429,10.62,73.04,'left']],
  441:[[515,8.33,60.71,'left']],
  515:[[441,87.08,69.29,'right']],
  445:[[479,93.75,67.86,'right']],
  479:[[445,25,58.57,'left']],
  664:[[662,10.42,53.57,'left']],
  666:[[662,13.23,83.57,'left']],
  662:[[664,41.04,26.07,'up'],[666,66.25,16.43,'up']],
  683:[[684,82.19,46.51,'right']],
  684:[[683,9.8,16.88,'left'],[685,84.72,34.59,'right']],
  685:[[684,10.21,74.84,'left'],[686,95.21,38.79,'right']],
  686:[[685,17.69,70.92,'left']],
  29:[[710,70.23,74.54,'down']],
  710:[[29,39.68,83,'down']],
  722:[[724,43.54,89.88,'down']],
  724:[[722,58.33,30.76,'up']],
  744:[[741,6.04,74.58,'left'],[746,82.39,32.27,'right']],
  746:[[744,11.46,76.34,'left']],
  741:[[744,40.42,81.43,'down']],
  784:[[775,13.66,68.66,'left']],
  780:[[782,20.1,20.19,'left']],
  782:[[780,13.87,88.38,'down']],
  775:[[784,81.89,66.88,'right']],
  786:[[789,21.55,59.71,'left']],
  789:[[786,94.64,65.47,'right']],
  803:[[799,85.86,75.35,'right']],
  799:[[803,87.3,67.53,'right']],
  110:[[102,21.04,51.79,'left']],
  402:[[100,7.5,63.75,'left']],
};
/** Original map defaults (0) and FromMap-specific entries, in image percentages. */
const originalEntries: Record<number, Record<number, readonly [number, number]>> = {
  1:{0:[51.67,54.29]},
  515:{0:[87.50,75.89],681:[19.27,44.64]},
  4:{0:[10.83,79.64]},
  5:{0:[73.65,76.74]},
  775:{0:[16.98,81.79],776:[70.42,10.54],784:[80.31,66.79]},
  10:{0:[75.52,30.71],1:[73.96,33.04],11:[7.92,75.00]},
  11:{0:[76.56,42.86],10:[86.46,42.86],12:[17.19,64.29],1706:[47.92,39.29]},
  12:{0:[78.12,29.64]},
  780:{0:[44.79,87.50],778:[34.38,85.71],781:[84.38,67.68],782:[20.10,20.18]},
  782:{0:[24.38,88.04]},
  15:{0:[17.71,48.21]},
  16:{0:[15.62,51.43],17:[48.54,26.79]},
  17:{0:[11.46,24.11]},
  784:{0:[12.71,62.86]},
  786:{0:[11.98,79.46],787:[83.33,69.64]},
  20:{0:[74.79,35.89],1:[74.79,35.89],21:[44.79,80.36]},
  789:{0:[92.71,62.50]},
  21:{0:[69.06,38.75],22:[20.83,62.50]},
  22:{0:[21.15,16.43],737:[72.92,67.86]},
  25:{0:[8.33,44.64]},
  26:{0:[20.00,44.11]},
  27:{0:[65.94,49.46]},
  29:{0:[44.79,83.93],710:[69.27,81.25]},
  30:{0:[68.65,75.00],1:[68.65,75.00],31:[20.83,21.43]},
  31:{0:[31.04,78.57],30:[31.04,78.57],32:[87.08,24.11]},
  32:{0:[27.40,78.57]},
  799:{0:[5.73,66.61],801:[50.00,33.93],803:[91.15,78.21]},
  803:{0:[80.73,75.89],805:[19.90,61.07]},
  40:{0:[68.44,71.07],41:[31.25,41.61]},
  41:{0:[80.33,32.80],43:[45.55,89.13]},
  46:{0:[11.25,65.71],49:[76.88,22.14]},
  51:{0:[65.10,72.32],53:[31.25,35.71]},
  53:{0:[8.02,85.71],691:[83.33,40.18]},
  54:{0:[79.08,55.36],55:[59.83,22.32]},
  55:{0:[66.15,85.71]},
  314:{0:[43.46,50.00]},
  315:{0:[27.08,30.36]},
  60:{0:[55.52,69.29],61:[88.54,33.04],62:[88.54,33.04]},
  61:{0:[13.23,71.07]},
  325:{0:[26.39,78.43]},
  326:{0:[23.93,77.68]},
  327:{0:[18.67,59.29]},
  100:{0:[19.79,41.96]},
  102:{0:[58.33,55.36],108:[25.00,61.43],1011:[13.54,38.21],503:[40.62,74.29],793:[17.60,56.79]},
  106:{0:[80.00,74.82],46:[42.60,35.00]},
  110:{0:[62.50,53.57]},
  402:{0:[10.42,46.43]},
  404:{0:[48.96,75.00]},
  662:{0:[47.92,84.82]},
  664:{0:[16.67,52.68]},
  666:{0:[23.54,75.00]},
  414:{0:[52.08,62.50]},
  423:{0:[14.58,32.86]},
  683:{0:[15.62,53.57],684:[83.33,35.71]},
  684:{0:[10.42,17.86],687:[83.33,66.96],685:[75.00,35.71]},
  429:{0:[50.00,83.93],430:[67.71,80.36]},
  430:{0:[9.38,75.00]},
  685:{0:[10.42,71.43],686:[93.75,35.71]},
  686:{0:[15.62,71.43]},
  435:{0:[23.75,63.21]},
  436:{0:[4.69,35.71]},
  437:{0:[71.35,60.71]},
  438:{0:[22.92,36.61]},
  441:{0:[65.10,78.57],515:[9.90,65.18]},
  445:{0:[93.75,71.43],479:[93.75,70.89],446:[70.83,20.00]},
  710:{0:[40.62,85.71],712:[45.31,54.46]},
  463:{0:[78.12,80.36]},
  464:{0:[28.12,53.57]},
  722:{0:[62.50,84.82]},
  724:{0:[28.65,82.14],722:[60.21,36.43]},
  479:{0:[32.92,72.14]},
  741:{0:[65.62,89.29]},
  744:{0:[17.19,84.82],746:[88.75,35.71]},
  746:{0:[17.19,73.93]},
};
const point = (x: number, y: number): ScenePoint => ({ x, y });
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const opposite: Record<SceneExitFacing, SceneExitFacing> = { left: 'right', right: 'left', up: 'down', down: 'up' };
function inset(anchor: ScenePoint, facing: SceneExitFacing): ScenePoint {
  return point(clamp(anchor.x + (facing === 'left' ? 7 : facing === 'right' ? -7 : 0), 8, 92),
    clamp(anchor.y + (facing === 'up' ? 10 : facing === 'down' ? -10 : 0), 12, 90));
}
function caption(planet: WorldPlanet, region: WorldRegion) {
  return region.name.startsWith(planet.name) && region.name.length > planet.name.length
    ? region.name.slice(planet.name.length) : region.name;
}
/** Local scene connections only: a singleton scene has no invented atlas exit. */
export function getSceneExits(planet: WorldPlanet, region: WorldRegion): SceneExit[] {
  const regions = planet.regions;
  if (regions.length < 2) return [];
  // A duplicate map ID (for example Cecilia's authored ice-plain encounter)
  // cannot create a second historical identity for the same original doorway.
  const canonical = new Map<number, WorldRegion>();
  for (const candidate of regions) if (candidate.originalMapId && !canonical.has(candidate.originalMapId))
    canonical.set(candidate.originalMapId, candidate);
  const exits = new Map<string, SceneExit[]>();
  const components = new Map(regions.map(candidate => [candidate.id, candidate.id]));
  const find = (id: string): string => {
    const parent = components.get(id)!;
    return parent === id ? id : find(parent);
  };
  const connect = (a: string, b: string) => components.set(find(a), find(b));
  const list = (id: string) => {
    if (!exits.has(id)) exits.set(id, []);
    return exits.get(id)!;
  };
  function add(from: WorldRegion, target: WorldRegion, anchor: ScenePoint, facing: SceneExitFacing,
    source: SceneExit['source']) {
    if (from.id === target.id || list(from.id).some(exit => exit.targetRegionId === target.id)) return;
    // The marker may be inset a few percent so a full label fits on small scenes.
    const visible = point(clamp(anchor.x, 9, 91), clamp(anchor.y, 10, 89));
    list(from.id).push({ id: `${from.id}:${target.id}`, targetRegionId: target.id, anchor: visible, facing,
      caption: caption(planet, target), fullName: target.name, ariaLabel: `前往${target.name}`,
      entry: point(50, 80), source, originalMapId: from.originalMapId, targetOriginalMapId: target.originalMapId });
    connect(from.id, target.id);
  }
  for (const from of regions) {
    if (!from.originalMapId || canonical.get(from.originalMapId) !== from) continue;
    for (const [targetMapId, x, y, facing] of originalRoutes[from.originalMapId] ?? []) {
      const target = canonical.get(targetMapId);
      if (target) add(from, target, point(x, y), facing, 'official');
    }
  }
  function authoredAnchor(from: WorldRegion, facing: SceneExitFacing): ScenePoint {
    const choices = facing === 'left' ? [point(14, 82), point(14, 56), point(14, 30)]
      : facing === 'right' ? [point(86, 82), point(86, 56), point(86, 30)]
      : facing === 'up' ? [point(50, 18), point(30, 18), point(70, 18)]
      : [point(50, 86), point(30, 86), point(70, 86)];
    return choices.find(candidate => list(from.id).every(exit =>
      Math.abs(exit.anchor.x - candidate.x) > 20 || Math.abs(exit.anchor.y - candidate.y) > 20)) ?? choices[0];
  }
  // Source functions sometimes replace a reverse changeMapComp record. A labeled
  // authored return preserves bidirectional access without claiming its hotspot.
  for (const from of regions) for (const exit of [...list(from.id)]) {
    const target = regions.find(candidate => candidate.id === exit.targetRegionId)!;
    if (!list(target.id).some(reverse => reverse.targetRegionId === from.id)) {
      const facing = opposite[exit.facing];
      add(target, from, authoredAnchor(target, facing), facing, 'authored');
    }
  }
  // Retain only enough former sequential connections to attach disconnected
  // custom/source-incomplete areas; existing original branches take precedence.
  for (let i = 1; i < regions.length; i++) {
    const from = regions[i - 1], target = regions[i];
    if (find(from.id) === find(target.id)) continue;
    add(from, target, authoredAnchor(from, 'right'), 'right', 'authored');
    add(target, from, authoredAnchor(target, 'left'), 'left', 'authored');
  }
  for (const from of regions) for (const exit of list(from.id)) {
    const target = regions.find(candidate => candidate.id === exit.targetRegionId)!;
    const entries = target.originalMapId && canonical.get(target.originalMapId) === target
      ? originalEntries[target.originalMapId] : undefined;
    const original = exit.source === 'official' && entries ? entries[from.originalMapId ?? 0] ?? entries[0] : undefined;
    const reverse = list(target.id).find(candidate => candidate.targetRegionId === from.id);
    exit.entry = original ? point(clamp(original[0], 2, 98), clamp(original[1], 2, 98))
      : reverse ? inset(reverse.anchor, reverse.facing) : point(50, 80);
  }
  return list(region.id);
}
