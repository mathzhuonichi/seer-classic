// The one source of creature portrait paths and art layout.
import type { CSSProperties } from 'react';
import data from './creature-art-data.json';

export interface CreatureArtProfile {
  src: string;
  nativeWidth: number;
  nativeHeight: number;
  bounds: { x: number; y: number; width: number; height: number };
  /** Relative visible silhouette extent; art direction, not canonical height. */
  physicalScale: number;
  familyRoot: number;
  evolutionStage: number;
}

/** Measured rows: native size, visible alpha bounds, family root, stage, scale and an optional vector source. */
type ArtRow = [number, number, number, number, number, number, number, number, number, string?];
const rows = data as unknown as Record<string, ArtRow>;

/** Raster portrait published under `public/portraits/`. */
export const portraitPath = (speciesId: number) => `/portraits/${speciesId}.png`;

export function getCreatureArt(speciesId: number): CreatureArtProfile {
  const row = rows[String(speciesId)];
  if (!row) return {
    src: portraitPath(speciesId), nativeWidth: 1, nativeHeight: 1,
    bounds: { x: 0, y: 0, width: 1, height: 1 }, physicalScale: .84,
    familyRoot: speciesId, evolutionStage: 0,
  };
  const [width, height, x, y, visibleWidth, visibleHeight, root, stage, scale, src] = row;
  return {
    src: typeof src === 'string' ? src : portraitPath(speciesId),
    nativeWidth: width, nativeHeight: height,
    bounds: { x, y, width: visibleWidth, height: visibleHeight },
    familyRoot: root, evolutionStage: stage, physicalScale: scale,
  };
}

/**
 * Use on an img inside a square, position:relative wrapper. Visible alpha bounds
 * are centered horizontally and grounded by default; battle can also center
 * the visible silhouette vertically. Animation and mirroring use the wrapper.
 * Without boxSize, percentages follow the wrapper's responsive dimensions.
 */
export function creatureArtStyle(
  speciesId: number,
  boxSize?: number,
  options: { scaleByStage?: boolean; fill?: number; verticalAlign?: 'ground' | 'center' } = {},
): CSSProperties {
  const art = getCreatureArt(speciesId);
  const extent = (options.fill ?? .90) * (options.scaleByStage === false ? 1 : art.physicalScale);
  const factor = extent / Math.max(art.bounds.width, art.bounds.height);
  const unit = (value: number) => boxSize === undefined ? `${value * 100}%` : value * boxSize;
  return {
    position: 'absolute',
    width: unit(art.nativeWidth * factor), height: unit(art.nativeHeight * factor),
    left: unit(.5 - (art.bounds.x + art.bounds.width / 2) * factor),
    ...(options.verticalAlign === 'center'
      ? { top: unit(.5 - (art.bounds.y + art.bounds.height / 2) * factor) }
      : { bottom: unit(-(art.nativeHeight - art.bounds.y - art.bounds.height) * factor) }),
    maxWidth: 'none', maxHeight: 'none', objectFit: 'fill',
  };
}

/** Idle-breathing phase and period, staggered by species so neighbouring cards never move in step. */
export function creatureIdleTiming(speciesId: number): CSSProperties {
  return { animationDelay: `-${speciesId % 11 * .27 / 1.5}s`, animationDuration: `${(3.6 + speciesId % 4 * .2) / 1.5}s` };
}
