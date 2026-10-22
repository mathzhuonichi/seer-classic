// Where an original skill effect plays: the original fight module's placement rule, mapped onto the arena.

/**
 * Stage px between the two creatures' registration points in the original fight scene: (180, 260) and (780, 260) on its
 * 960x560 stage. Skill SWFs are drawn in the attacker's frame with the target at (+600, 0).
 */
export const ORIGINAL_CREATURE_SEPARATION = 600;

/** A box in one coordinate space, e.g. a getBoundingClientRect. */
export interface Box { left: number; top: number; width: number; height: number }

/** A skill clip's registration point in its layer, and its scale (a negative scaleX mirrors it). */
export interface SkillEffectPlacement { x: number; y: number; scaleX: number; scaleY: number }

const centre = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * The original client (UseSkillController.petPlay) put the skill clip at the attacker's registration point, unscaled, with
 * the attacker's own scaleX, so a right-hand attacker's effect is mirrored; the target is never used. Here the registration
 * point is the acting creature's box centre, and one stage px is the creatures' separation over the original 600, so the
 * effect's target point lands on the other creature. Boxes share one coordinate space; null before the creatures are laid out.
 */
export function skillEffectPlacement(layer: Box, creatures: readonly [Box, Box], side: 0 | 1): SkillEffectPlacement | null {
  const [left, right] = creatures.map(centre), actor = side === 0 ? left : right;
  const scale = (right.x - left.x) / ORIGINAL_CREATURE_SEPARATION;
  if (!(scale > 0)) return null;
  return { x: actor.x - layer.left, y: actor.y - layer.top, scaleX: side === 0 ? scale : -scale, scaleY: scale };
}
