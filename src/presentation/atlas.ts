import { WORLD_GALAXIES, WORLD_PLANETS, type WorldLocationId, type WorldPlanet, type WorldRegion } from '../world.ts';
import graphAssets from './atlas-graph-assets.json';

/** The graphical star atlas: recovered page artwork with hotspots that lead to galaxies, planets and landings. */
export type AtlasView = { kind: 'overview' } | { kind: 'galaxy'; galaxyId: string } | { kind: 'planet'; planetId: string };
/** A rectangle in page artwork pixels. */
export interface AtlasRect { x: number; y: number; width: number; height: number }
export interface AtlasNode extends AtlasRect {
  id?: string; targetKind: 'galaxy' | 'planet' | 'region' | 'back'; targetId?: string; mapId?: number;
  asset?: string; label?: string; drawLabel?: boolean; labelX?: number; labelY?: number; planetId?: string; regionId?: string;
}
export interface AtlasArtwork extends AtlasRect { asset: string }
export interface AtlasTitlePlate extends AtlasRect { fontSize?: number; color?: string }
export interface AtlasPage {
  width: number; height: number; background?: string; bg?: string; nodes: AtlasNode[];
  heading?: string; headingInArtwork?: boolean; decorations?: AtlasArtwork[]; titleRect?: AtlasTitlePlate; titlePlate?: AtlasTitlePlate;
}
export interface AtlasGraphics { pages: Record<string, AtlasPage>; backArrow?: string }
export const ATLAS_GRAPHICS = graphAssets as unknown as AtlasGraphics;

/** Explicit canonical IDs take priority over the source map-ID fallback. */
export function atlasNodePlanet(node: AtlasNode): WorldPlanet | undefined {
  return WORLD_PLANETS.find(planet => node.planetId === planet.id)
    ?? WORLD_PLANETS.find(planet => node.targetId === planet.id)
    ?? (node.mapId === undefined ? undefined : WORLD_PLANETS.find(planet => node.mapId === planet.originalMapId));
}
export function atlasNodeRegion(node: AtlasNode, planet: WorldPlanet): WorldRegion | undefined {
  return planet.regions.find(region => node.regionId === region.id)
    ?? planet.regions.find(region => node.targetId === region.id)
    ?? (node.mapId === undefined ? undefined : planet.regions.find(region => node.mapId === region.originalMapId));
}
/** A planet page is keyed by its ID when one exists, otherwise by its original map ID. */
export const planetPageKey = (planet: WorldPlanet | undefined) =>
  planet && ATLAS_GRAPHICS.pages[`planet-${planet.id}`] ? `planet-${planet.id}` : `planet-${planet?.originalMapId}`;
export const atlasPageKey = (view: AtlasView, planet: WorldPlanet | undefined) =>
  view.kind === 'overview' ? 'overview' : view.kind === 'galaxy' ? `galaxy-${view.galaxyId}` : planetPageKey(planet);
/** A rectangle as percentages of its page, for absolute positioning over the artwork. */
export const pageBox = (rect: AtlasRect, page: AtlasPage) => ({
  left: `${rect.x / page.width * 100}%`, top: `${rect.y / page.height * 100}%`,
  width: `${rect.width / page.width * 100}%`, height: `${rect.height / page.height * 100}%`,
});

/** A planet view leads back to its galaxy; the ship's planets and galaxies lead back to the overview. */
export const leadsToGalaxy = (view: AtlasView, planet: WorldPlanet | undefined) => view.kind === 'planet' && planet?.galaxyId !== 'ship';
export const backLabel = (view: AtlasView, planet: WorldPlanet | undefined) => leadsToGalaxy(view, planet) ? '返回星系地图' : '返回宇宙地图';
export function backView(view: AtlasView, planet: WorldPlanet | undefined): AtlasView {
  return leadsToGalaxy(view, planet) ? { kind: 'galaxy', galaxyId: planet?.galaxyId ?? WORLD_GALAXIES[0].id } : { kind: 'overview' };
}

export type AtlasTarget = { kind: 'back' } | { kind: 'view'; view: AtlasView } | { kind: 'travel'; destination: WorldLocationId };
export interface AtlasNodeAction { label: string; current: boolean; target: AtlasTarget }

/** What a hotspot does on the page for `view`, and whether it marks the explorer's current location; undefined when it leads nowhere. */
export function atlasNodeAction(node: AtlasNode, view: AtlasView, viewPlanet: WorldPlanet | undefined, current: { planet: WorldPlanet; region: WorldRegion }): AtlasNodeAction | undefined {
  if (node.targetKind === 'back') return { label: backLabel(view, viewPlanet), current: false, target: { kind: 'back' } };
  if (node.targetKind === 'galaxy') {
    const galaxy = WORLD_GALAXIES.find(entry => entry.id === node.targetId || entry.originalId === node.mapId);
    return galaxy && { label: `进入${galaxy.name}`, current: current.planet.galaxyId === galaxy.id, target: { kind: 'view', view: { kind: 'galaxy', galaxyId: galaxy.id } } };
  }
  if (node.targetKind === 'planet') {
    const planet = atlasNodePlanet(node);
    if (!planet) return undefined;
    // A single-landing planet travels at once instead of opening its page.
    const [only] = planet.regions.length === 1 ? planet.regions : [];
    return { label: only ? `前往${only.name}` : `查看${planet.name}登陆地点`, current: current.planet.id === planet.id,
      target: only ? { kind: 'travel', destination: { planetId: planet.id, regionId: only.id } } : { kind: 'view', view: { kind: 'planet', planetId: planet.id } } };
  }
  const planet = node.planetId ? atlasNodePlanet(node) : viewPlanet ?? atlasNodePlanet(node);
  const landing = planet && atlasNodeRegion(node, planet);
  return planet && landing && { label: `前往${landing.name}`, current: current.planet.id === planet.id && current.region.id === landing.id,
    target: { kind: 'travel', destination: { planetId: planet.id, regionId: landing.id } } };
}
