import { clamp, percentIn, point, type ScenePoint, type ScreenRect } from './scene-geometry.ts';

/** The player robot's walking geometry, in scene percentages unless noted. */
export type RobotDirection = 'front' | 'back' | 'left' | 'right' | 'front-left' | 'front-right' | 'back-left' | 'back-right';

/** Arrow keys walk four percent of the scene per press. */
export const ARROW_STEPS: Readonly<Record<string, readonly [dx: number, dy: number]>> = {
  ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4],
};
const MIN_WALK_MS = 320;

export function robotDirection(dx: number, dy: number): RobotDirection {
  const views: RobotDirection[] = ['right', 'front-right', 'front', 'front-left', 'left', 'back-left', 'back', 'back-right'];
  return views[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
}

/** The robot stands at 95% of its box height; the name tag hangs below. */
export const robotFoot = (robot: ScreenRect, scene: ScreenRect) =>
  percentIn(scene, robot.left + robot.width / 2, robot.top + robot.height * .95);
/** A creature host ends at its feet. */
export const contactFoot = (contact: ScreenRect & { bottom: number }, scene: ScreenRect) =>
  percentIn(scene, contact.left + contact.width / 2, contact.bottom);

/** Facing and CSS walk duration for a move measured in screen pixels; no scene measures a 100 by 100 frame. */
export function walkTiming(from: ScenePoint, to: ScenePoint, scene: { width: number; height: number } | undefined, reducedMotion: boolean) {
  const dx = (to.x - from.x) * (scene?.width ?? 100) / 100, dy = (to.y - from.y) * (scene?.height ?? 100) / 100;
  const distance = Math.hypot(dx, dy);
  return {
    direction: distance > .5 ? robotDirection(dx, dy) : undefined,
    duration: reducedMotion ? 0 : Math.max(MIN_WALK_MS, distance / Math.max(90, (scene?.width ?? 1000) * .22) * 1000),
  };
}

export interface WalkMotion {
  moving: boolean;
  /** The CSS transition time of the current move, in milliseconds. */
  duration: number;
  direction: RobotDirection;
  /** The creature instance the robot is walking up to; it holds still meanwhile. */
  approaching: string | null;
}
export const IDLE_WALK: WalkMotion = { moving: false, duration: 650, direction: 'front', approaching: null };
export type WalkEvent =
  | { type: 'start'; duration: number; direction?: RobotDirection; approaching: string | null }
  /** Arrival or interruption; `duration` and `direction` set the next transition and facing. */
  | { type: 'stop'; duration?: number; direction?: RobotDirection };

/** The robot's motion state machine: a zero-length start arrives at once and never holds a creature. */
export function walkMotion(state: WalkMotion, event: WalkEvent): WalkMotion {
  if (event.type === 'start') return {
    moving: event.duration > 0, duration: event.duration, direction: event.direction ?? state.direction,
    approaching: event.duration > 0 ? event.approaching : null,
  };
  return { moving: false, duration: event.duration ?? state.duration, direction: event.direction ?? state.direction, approaching: null };
}

/** Stop on the near side of a contact in screen space, never past its feet. */
export function contactApproachPoint(from: ScenePoint, contact: ScenePoint, scene: { width: number; height: number }, clearance: number): ScenePoint {
  const dx = (from.x - contact.x) * scene.width / 100;
  const dy = (from.y - contact.y) * scene.height / 100;
  const distance = Math.hypot(dx, dy);
  if (distance <= clearance || distance === 0) return { ...from };
  const fraction = clearance / distance;
  return { x: contact.x + (from.x - contact.x) * fraction, y: contact.y + (from.y - contact.y) * fraction };
}

/** Where the robot stops to talk to a contact, and whether it is already there (within one pixel). */
export function approachStop(from: ScenePoint, contact: ScenePoint, scene: ScreenRect, contactWidth: number, robotWidth: number | undefined) {
  const clearance = Math.max(scene.width * .025, Math.min(scene.width * .08, (contactWidth + (robotWidth ?? scene.width * .06)) * .35));
  const stop = contactApproachPoint(from, contact, scene, clearance);
  return { stop, immediate: Math.hypot((stop.x - from.x) * scene.width / 100, (stop.y - from.y) * scene.height / 100) < 1 };
}

/** At the image edge, keep the complete robot visible without moving the requested point. */
export function visiblePlayerPoint(position: ScenePoint, scene: { width: number; height: number }): ScenePoint {
  const width = clamp(scene.width * .06, 40, 72), height = clamp(scene.width * .075, 50, 90) + 17;
  return point(
    clamp(position.x, (width / 2 + 3) / scene.width * 100, 100 - (width / 2 + 3) / scene.width * 100),
    clamp(position.y, (height * .95 + 3) / scene.height * 100, 100 - (height * .05 + 3) / scene.height * 100),
  );
}
