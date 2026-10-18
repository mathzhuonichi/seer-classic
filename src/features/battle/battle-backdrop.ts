import type { BattleView } from '../../shared/views.ts';
import { resolveWorldLocation, type WorldLocationId } from '../../domain/world/world.ts';
import { getCreatureArt } from '../../shared/creature-art.ts';
import { appearanceOf } from '../../shared/monster-views.ts';

/** The background and location name a battle is fought in front of. */
export interface BattleBackdrop { src: string; name: string }

export function locationBackdrop({ planetId, regionId }: WorldLocationId, name?: string): BattleBackdrop {
  const { planet, region } = resolveWorldLocation(planetId, regionId);
  return { src: region.background ?? planet.background, name: name ?? region.name };
}

/** Every image the battle scene shows first: the backdrop, each creature's art and portrait. */
export function battleImageSources(backdrop: BattleBackdrop, battle: Pick<BattleView, 'party' | 'enemyParty'>): string[] {
  const creatures = [...battle.party, ...battle.enemyParty];
  return [...new Set([backdrop.src, ...creatures.flatMap(mon => [getCreatureArt(appearanceOf(mon)).src, mon.portrait])])];
}
