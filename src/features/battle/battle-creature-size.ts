// How large a creature is drawn in battle (design/notes/battle-native-size.md). The original game showed every clip at its
// native size, so a creature's extent, the share of its square creature box that the largest side of its first standby pose
// fills, is that pose's size in clip units (`standbySize`, measured by tools/assets/measure_battle_standby_size.py) times
// one scale. The constants live in battle-creature-size.json, which tools/assets/audit_battle_hd_density.py also reads:
// - calibrationSpecies, calibrationExtent: 丽莎布布 keeps the extent it had under the per-stage art direction it replaces,
//   physicalScale .96 x fill .9; this fixes the scale.
// - maxExtent: the cap for the few clips larger than the arena leaves room for.
import index from '../../../public/battle-animations/runtime-index.json';
import sizing from './battle-creature-size.json';

const sizes: Record<string, {standbySize: number}> = index.species;
/** Extent per clip unit. */
const EXTENT_PER_UNIT = sizing.calibrationExtent / sizes[sizing.calibrationSpecies].standbySize;

/** The battle extent of the displayed species, for its clip and its portrait alike; a species without a clip has the calibration extent. */
export function battleCreatureExtent(species: number): number {
  const size = sizes[species]?.standbySize;
  return size === undefined ? sizing.calibrationExtent : Math.min(size * EXTENT_PER_UNIT, sizing.maxExtent);
}
