import { constrainHabitatPoint, type SceneLayout } from './map-presentation.ts';
import { clamp, point, polygonBounds, type SceneBounds, type ScenePoint } from './scene-geometry.ts';

/** Wildlife wandering: one pure frame step per creature. Randomness is injected. */
export type RoamRandom = () => number;
export interface RoamLeg { from: ScenePoint; to: ScenePoint; control: ScenePoint | null; elapsed: number; duration: number }
export interface RoamState { position: ScenePoint; rest: number; leg: RoamLeg | null; facing: 'left' | 'right' }
export interface Size { width: number; height: number }
/** One frame's CSS layout measurements: the scene, the creature host and its name label. */
export interface RoamFrame { scene: Size; body: Size; labelHeight: number }
export interface RoamContext {
  layout: SceneLayout; home: ScenePoint; territory: SceneBounds;
  /** Position bounds that keep the scaled host and its label inside the scene. */
  bounds: SceneBounds;
  scene: Size; random: RoamRandom;
}

/** The longest frame step, so a stalled tab does not jump a creature across the scene. */
export const MAX_ROAM_FRAME_MS = 80;
const LABEL_GAP = 4;

const between = (random: RoamRandom, low: number, high: number) => low + random() * (high - low);
const offset = (random: RoamRandom, origin: ScenePoint, radius: ScenePoint) =>
  point(origin.x + between(random, -radius.x, radius.x), origin.y + between(random, -radius.y, radius.y));
const intersect = (a: SceneBounds, b: SceneBounds): SceneBounds =>
  ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });

/** The habitat's bounding box, narrowed to the home's local territory when the layout sets one. */
export function roamTerritory(layout: SceneLayout, home: ScenePoint): SceneBounds {
  const bounds = polygonBounds(layout.habitat);
  if (!layout.homeRoam) return bounds;
  const { x, y } = layout.homeRoam;
  return intersect(bounds, { left: home.x - x, top: home.y - y, right: home.x + x, bottom: home.y + y });
}

/** The scale that fits the host above its label in a small viewport, and the resulting position bounds. */
export function roamFit({ scene, body, labelHeight }: RoamFrame): { scale: number; bounds: SceneBounds } {
  // The host ends at the creature's feet; its name is outside the art box.
  const padding = Math.min(12, Math.max(1, Math.min(scene.width, scene.height) * .04));
  const label = labelHeight + LABEL_GAP;
  const fit = Math.min(1, (scene.width - padding * 2) / body.width, (scene.height - padding * 2) / (body.height + label));
  const scale = Math.max(.01, fit), width = body.width * scale, height = body.height * scale;
  return { scale, bounds: {
    left: (width / 2 + padding) / scene.width * 100, right: 100 - (width / 2 + padding) / scene.width * 100,
    top: (height + padding) / scene.height * 100, bottom: 100 - (padding + label * scale) / scene.height * 100,
  } };
}

function constrainer({ layout, territory, bounds }: RoamContext) {
  return (position: ScenePoint): ScenePoint => constrainHabitatPoint(layout, point(
    clamp(layout.homeRoam ? clamp(position.x, territory.left, territory.right) : position.x, bounds.left, bounds.right),
    clamp(layout.homeRoam ? clamp(position.y, territory.top, territory.bottom) : position.y, bounds.top, bounds.bottom)));
}

export function startRoam(context: RoamContext): RoamState {
  const constrain = constrainer(context);
  const { home, random } = context;
  return { position: constrain(point(home.x + between(random, -7, 7), home.y + between(random, -5, 5))), rest: between(random, 150, 1400), leg: null, facing: 'right' };
}

/** A uniformly sampled habitat point inside both the territory and the visible bounds. */
function habitatSample(context: RoamContext, constrain: (position: ScenePoint) => ScenePoint, center: ScenePoint): ScenePoint {
  const { left, right, top, bottom } = intersect(context.bounds, context.territory);
  if (right <= left || bottom <= top) return center;
  for (let attempt = 0; attempt < 24; attempt++) {
    const candidate = point(between(context.random, left, right), between(context.random, top, bottom)), projected = constrain(candidate);
    if (Math.hypot(candidate.x - projected.x, candidate.y - projected.y) < .001) return candidate;
  }
  return center;
}

/** After resting, pick a nearby, habitat-wide or home-centered target and a straight or curved leg to it. */
function planLeg(roam: RoamState, context: RoamContext, constrain: (position: ScenePoint) => ScenePoint): RoamState {
  const { layout, random, scene } = context, center = constrain(context.home);
  // Independent routes stay inside the creature habitat; the player's
  // unrestricted interaction plane is deliberately separate.
  const choice = random();
  const target = choice < .45 ? constrain(offset(random, roam.position, layout.roam))
    : choice < .9 ? habitatSample(context, constrain, center)
      : constrain(offset(random, center, layout.roam));
  const dx = target.x - roam.position.x, dy = target.y - roam.position.y;
  const distance = Math.hypot(dx * scene.width / 100, dy * scene.height / 100);
  if (distance > 3) {
    const bend = between(random, -.55, .55);
    const control = random() < .65 ? constrain(point((target.x + roam.position.x) / 2 - dy * bend, (target.y + roam.position.y) / 2 + dx * bend)) : null;
    const duration = clamp(distance / between(random, scene.width * .035, scene.width * .075) * 1000, 900, 18000);
    return { ...roam, leg: { from: { ...roam.position }, to: target, control, elapsed: 0, duration } };
  }
  return { ...roam, rest: between(random, 600, 1700) };
}

/** Ease along the current leg; on arrival, rest (sometimes for longer). */
function followLeg(roam: RoamState, leg: RoamLeg, delta: number, random: RoamRandom, constrain: (position: ScenePoint) => ScenePoint): RoamState {
  const elapsed = Math.min(leg.duration, leg.elapsed + delta);
  const fraction = (1 - Math.cos(Math.PI * elapsed / leg.duration)) / 2;
  const from = constrain(leg.from), to = constrain(leg.to), control = leg.control && constrain(leg.control);
  const next = control ? point(
    (1 - fraction) ** 2 * from.x + 2 * (1 - fraction) * fraction * control.x + fraction ** 2 * to.x,
    (1 - fraction) ** 2 * from.y + 2 * (1 - fraction) * fraction * control.y + fraction ** 2 * to.y,
  ) : point(from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction);
  const horizontal = next.x - roam.position.x;
  const facing = Math.abs(horizontal) > .001 ? horizontal < 0 ? 'left' : 'right' : roam.facing;
  const moved = { ...roam, facing, position: constrain(next), leg: { from, to, control, elapsed, duration: leg.duration } };
  if (elapsed >= leg.duration) return { ...moved, leg: null, rest: between(random, 450, 2600) + (random() < .18 ? between(random, 1700, 4300) : 0) };
  return moved;
}

/** One frame: keep the creature on its terrain and, unless paused, rest or walk for `delta` ms. */
export function advanceRoam(state: RoamState, context: RoamContext, delta: number, paused: boolean): RoamState {
  const constrain = constrainer(context);
  let roam: RoamState = { ...state, position: constrain(state.position) };
  if (paused) return roam;
  if (!roam.leg) {
    roam = { ...roam, rest: roam.rest - delta };
    if (roam.rest <= 0) roam = planLeg(roam, context, constrain);
  }
  return roam.leg ? followLeg(roam, roam.leg, delta, context.random, constrain) : roam;
}
