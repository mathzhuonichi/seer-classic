/** Authored exploration layout. Navigation preferences do not modify gameplay saves. */
export interface WorldRegion {
  id: string; name: string; description: string; x: number; y: number;
  creatures: number[]; levels: [number, number]; bossIds?: string[];
  /** One neutral contact opens the saved campaign instead of a specific stage. */
  campaignId?: string;
  /** Per-species encounter levels; species without an entry use `levels`. */
  creatureLevels?: Record<number, [number, number]>;
  /** Species shown once per scene, such as special map spawns. */
  scarceCreatures?: number[];
  /** Visible map contacts that open a collection quest instead of a field battle. */
  recruitmentSpecies?: number[];
  facility?: 'recovery' | 'missions' | 'challenges' | 'battle';
  /** Optional direct facility identity for a region-specific interaction. */
  battleFacility?: 'random' | 'elite' | 'classic';
  originalMapId?: number;
  background?: string; backgroundKind?: 'official' | 'remastered' | 'authored';
  /** Recovered artwork reused when this original subregion has no local art. */
  backgroundMapId?: number; sceneAttribution?: string;
  /** Resolved source map identity, independent of its original or HD asset URL. */
  backgroundAssetMapId?: number;
  /** An authored challenge rendezvous, not a claimed original encounter location. */
  challengeStaging?: boolean;
}
export interface WorldPlanet {
  id: string; name: string; subtitle: string; theme: string; color: string;
  galaxyId: string; background: string; regions: WorldRegion[];
  /** Reused authored scenery is an illustrative remake backdrop, not original map art. */
  sceneAttribution?: string; sources?: string[];
  originalMapId?: number; aliases?: string[];
}
export interface WorldGalaxy { id: string; name: string; subtitle: string; color: string; originalId: number }
/** A planet and one of its regions, by ID. */
export interface WorldLocationId { planetId: string; regionId: string }

/** An initial form placed from an original map spawn list (data/habitats.json). */
export interface GeneratedHabitat {
  species: number; name: string; planetId: string; regionId: string; levels: [number, number];
  scarce: boolean; route: 'capture' | 'challenge' | 'recruitment'; evidence: string;
}
/** An authored wild-encounter replacement for one existing region. */
export interface FusionHabitat extends WorldLocationId { species: number[]; levels: [number, number]; description: string }
/** One offline map background: its public path and content hash. */
export interface MapArtwork { path: string; sha256: string }
