import type { WorldPlanet, WorldRegion } from '../world.ts';
import { ORIGINAL_ENTRIES, ORIGINAL_ROUTES, type SceneExitFacing } from './map-sources.ts';
import { clamp, point, type ScenePoint } from './scene-geometry.ts';

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

type AuthoredRoute = readonly [fromRegionId: string, toRegionId: string, x: number, y: number, facing: SceneExitFacing];
/**
 * Keep one hub and the three distinct original challenge scenes; the battle terminal
 * opens its three modes in place instead of duplicating map 102. These approach points
 * follow visible bridges and the tower elevator; their hit areas are adaptations, not
 * recovered Flash controls. Tower -> Mystery is registered before fallback connections,
 * and the Mystery return follows Map10032's visible lower-right doorway.
 */
const AUTHORED_ROUTES: Record<string, readonly AuthoredRoute[]> = {
  'space-station': [
    ['resources', 'brave-tower', 15, 49, 'left'], ['brave-tower', 'resources', 50, 84, 'down'],
    ['resources', 'dark-arena', 42, 84, 'down'],
    ['brave-tower', 'mystery', 50, 24, 'up'], ['mystery', 'brave-tower', 84.0572916667, 85.7142857143, 'right'],
  ],
};
/** Candidate marker positions for authored exits, tried in order. */
const AUTHORED_ANCHORS: Record<SceneExitFacing, readonly ScenePoint[]> = {
  left: [point(14, 82), point(14, 56), point(14, 30)],
  right: [point(86, 82), point(86, 56), point(86, 30)],
  up: [point(50, 18), point(30, 18), point(70, 18)],
  down: [point(50, 86), point(30, 86), point(70, 86)],
};
const OPPOSITE: Record<SceneExitFacing, SceneExitFacing> = { left: 'right', right: 'left', up: 'down', down: 'up' };
/** Arrival offset from a reverse doorway, pointing into the scene. */
const INSET: Record<SceneExitFacing, readonly [number, number]> = { left: [7, 0], right: [-7, 0], up: [0, 10], down: [0, -10] };
const DEFAULT_ENTRY: ScenePoint = Object.freeze(point(50, 80));

const inset = (anchor: ScenePoint, facing: SceneExitFacing): ScenePoint =>
  point(clamp(anchor.x + INSET[facing][0], 8, 92), clamp(anchor.y + INSET[facing][1], 12, 90));
const caption = (planet: WorldPlanet, region: WorldRegion) =>
  region.name.startsWith(planet.name) && region.name.length > planet.name.length ? region.name.slice(planet.name.length) : region.name;

/** The exits of every region on one planet, with connected-component tracking. */
class ExitGraph {
  readonly exits = new Map<string, SceneExit[]>();
  /** The first region of each original map ID: a duplicate cannot claim a second historical doorway. */
  readonly canonical = new Map<number, WorldRegion>();
  private readonly parent: Map<string, string>;
  constructor(readonly planet: WorldPlanet) {
    for (const region of planet.regions) if (region.originalMapId && !this.canonical.has(region.originalMapId))
      this.canonical.set(region.originalMapId, region);
    this.parent = new Map(planet.regions.map(region => [region.id, region.id]));
  }
  list(id: string): SceneExit[] {
    if (!this.exits.has(id)) this.exits.set(id, []);
    return this.exits.get(id)!;
  }
  component(id: string): string {
    const parent = this.parent.get(id)!;
    return parent === id ? id : this.component(parent);
  }
  region(id: string) { return this.planet.regions.find(candidate => candidate.id === id); }
  isCanonical(region: WorldRegion) { return !!region.originalMapId && this.canonical.get(region.originalMapId) === region; }
  add(from: WorldRegion, target: WorldRegion, anchor: ScenePoint, facing: SceneExitFacing, source: SceneExit['source']) {
    if (from.id === target.id || this.list(from.id).some(exit => exit.targetRegionId === target.id)) return;
    // The marker may be inset a few percent so a full label fits on small scenes.
    const visible = point(clamp(anchor.x, 9, 91), clamp(anchor.y, 10, 89));
    this.list(from.id).push({ id: `${from.id}:${target.id}`, targetRegionId: target.id, anchor: visible, facing,
      caption: caption(this.planet, target), fullName: target.name, ariaLabel: `前往${target.name}`,
      entry: DEFAULT_ENTRY, source, originalMapId: from.originalMapId, targetOriginalMapId: target.originalMapId });
    this.parent.set(this.component(from.id), this.component(target.id));
  }
  /** The first candidate marker clear of this region's existing exits. */
  authoredAnchor(from: WorldRegion, facing: SceneExitFacing): ScenePoint {
    const choices = AUTHORED_ANCHORS[facing];
    return choices.find(candidate => this.list(from.id).every(exit =>
      Math.abs(exit.anchor.x - candidate.x) > 20 || Math.abs(exit.anchor.y - candidate.y) > 20)) ?? choices[0];
  }
  addAuthored(from: WorldRegion, target: WorldRegion, facing: SceneExitFacing) {
    this.add(from, target, this.authoredAnchor(from, facing), facing, 'authored');
  }
}

function addOriginalRoutes(graph: ExitGraph) {
  for (const from of graph.planet.regions) {
    if (!graph.isCanonical(from)) continue;
    for (const [targetMapId, x, y, facing] of ORIGINAL_ROUTES[from.originalMapId!] ?? []) {
      const target = graph.canonical.get(targetMapId);
      if (target) graph.add(from, target, point(x, y), facing, 'official');
    }
  }
}
function addAuthoredRoutes(graph: ExitGraph) {
  for (const [fromId, toId, x, y, facing] of AUTHORED_ROUTES[graph.planet.id] ?? []) {
    const from = graph.region(fromId), target = graph.region(toId);
    if (from && target) graph.add(from, target, point(x, y), facing, 'authored');
  }
}
/** Source functions sometimes replace a reverse changeMapComp record. A labeled
 * authored return preserves bidirectional access without claiming its hotspot. */
function addReturnRoutes(graph: ExitGraph) {
  for (const from of graph.planet.regions) for (const exit of [...graph.list(from.id)]) {
    const target = graph.region(exit.targetRegionId)!;
    if (!graph.list(target.id).some(reverse => reverse.targetRegionId === from.id)) graph.addAuthored(target, from, OPPOSITE[exit.facing]);
  }
}
/** Retain only enough former sequential connections to attach disconnected
 * custom/source-incomplete areas; existing original branches take precedence. */
function connectNeighbours(graph: ExitGraph) {
  const regions = graph.planet.regions;
  for (let i = 1; i < regions.length; i++) {
    const from = regions[i - 1], target = regions[i];
    if (graph.component(from.id) === graph.component(target.id)) continue;
    graph.addAuthored(from, target, 'right');
    graph.addAuthored(target, from, 'left');
  }
}
/** Official doorways land on the recorded entry; others land inside the reverse doorway. */
function assignEntries(graph: ExitGraph) {
  for (const from of graph.planet.regions) for (const exit of graph.list(from.id)) {
    const target = graph.region(exit.targetRegionId)!;
    const entries = graph.isCanonical(target) ? ORIGINAL_ENTRIES[target.originalMapId!] : undefined;
    const original = exit.source === 'official' && entries ? entries[from.originalMapId ?? 0] ?? entries[0] : undefined;
    const reverse = graph.list(target.id).find(candidate => candidate.targetRegionId === from.id);
    exit.entry = original ? point(clamp(original[0], 2, 98), clamp(original[1], 2, 98))
      : reverse ? inset(reverse.anchor, reverse.facing) : DEFAULT_ENTRY;
  }
}

/** Local scene connections only: a singleton scene has no invented atlas exit. */
export function getSceneExits(planet: WorldPlanet, region: WorldRegion): SceneExit[] {
  if (planet.regions.length < 2) return [];
  const graph = new ExitGraph(planet);
  addOriginalRoutes(graph);
  addAuthoredRoutes(graph);
  addReturnRoutes(graph);
  connectNeighbours(graph);
  assignEntries(graph);
  return graph.list(region.id);
}
