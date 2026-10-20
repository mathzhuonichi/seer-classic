// How an original clip travels across the arena: each frame's extent, and the per-frame offsets that keep a move inside it.
import type {SwfClipData} from '@seer-pet-anim/swf-bundle';
import {EMPTY_BOUNDS, unionBounds, type AnimationBounds} from './battle-animation-registration.ts';

type Mesh = Pick<SwfClipData['sequences'][number]['frames'][number]['mesh'], 'positions' | 'indices' | 'mulColors'>;
/** The frame label of a clip's hit marker. */
const HIT_LABEL = 'action_hit';
/**
 * The creature's own parts lie within this many standby sizes of the middle of a frame (the median of its visible
 * triangles); farther triangles are effects left behind, such as a slash at the opponent while the creature flies home.
 */
export const BODY_REACH = 1;
/**
 * Toward the opponent a move keeps its own travel up to where its hit lands, within this share of the room ahead, so the
 * creature still lands on the opponent; only the travel beyond is compressed into the rest of the room.
 */
export const FORWARD_KEPT_SHARE = 0.75;
/** A room without walls: nothing is compressed. */
export const OPEN_ROOM: AnimationBounds = {minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity};

/** One sequence's frames: each frame's body extent (EMPTY_BOUNDS when nothing is visible) and its hit frame (-1: none). */
export interface SequencePath {frames: AnimationBounds[]; hitFrame: number}
/** Per-frame offsets of a sequence (mesh units), and the extent of its frames once offset. */
export interface ContainedPath {offsets: {x: number; y: number}[]; bounds: AnimationBounds}

const median = (values: number[]) => values.sort((a, b) => a - b)[values.length >> 1];

/** Extent of a frame's body: its visible triangles (any vertex not fully transparent) within `reach` of their median centroid. */
export function bodyBounds({positions, indices, mulColors}: Mesh, reach: number): AnimationBounds {
  const triangles: number[][] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]];
    if (corners.every(v => mulColors[v * 4 + 3] === 0)) continue;
    triangles.push(corners);
  }
  const centroids = triangles.map(corners => corners.reduce((sum, v) => [sum[0] + positions[v * 2] / 3, sum[1] + positions[v * 2 + 1] / 3], [0, 0]));
  const middleX = median(centroids.map(c => c[0])), middleY = median(centroids.map(c => c[1]));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  triangles.forEach((corners, i) => {
    if (Math.hypot(centroids[i][0] - middleX, centroids[i][1] - middleY) > reach) return;
    for (const v of corners) {
      minX = Math.min(minX, positions[v * 2]); maxX = Math.max(maxX, positions[v * 2]);
      minY = Math.min(minY, positions[v * 2 + 1]); maxY = Math.max(maxY, positions[v * 2 + 1]);
    }
  });
  return {minX, maxX, minY, maxY};
}

/** Each sequence's path, by sequence name; `home` is the standby extent, whose size scales BODY_REACH. */
export function sequencePaths(clip: Pick<SwfClipData, 'sequences'>, home: AnimationBounds): Map<string, SequencePath> {
  const reach = BODY_REACH * Math.max(home.maxX - home.minX, home.maxY - home.minY);
  return new Map(clip.sequences.filter(s => s.frames.length).map(s => [s.name, {
    frames: s.frames.map(frame => bodyBounds(frame.mesh, reach)), hitFrame: s.frames.findIndex(frame => frame.labels.includes(HIT_LABEL)),
  }]));
}

/** How far each frame reaches beyond the home extent on one side (0 for a frame inside it or without vertices). */
const beyond = (frames: AnimationBounds[], reach: (frame: AnimationBounds) => number) =>
  frames.map(frame => frame.minX > frame.maxX ? 0 : Math.max(0, reach(frame)));

/** Reaches squeezed into `room`: when the farthest does not fit, those up to `kept` stay and the rest scale linearly into what is left. */
function squeeze(reaches: number[], room: number, kept: number): number[] {
  const farthest = Math.max(0, ...reaches), space = Math.max(0, room);
  if (farthest <= space) return reaches;
  const knee = Math.min(Math.max(0, kept), space), rate = (space - knee) / (farthest - knee);
  return reaches.map(reach => reach <= knee ? reach : knee + (reach - knee) * rate);
}

/**
 * Offsets that bring a sequence's travel inside `room` (mesh units, x forward, y up) by compressing it on each side it
 * overflows; the creature keeps its size and pose. `home` is the standby extent the travel is measured from: frames within it
 * do not move. Up, down and back compress linearly from home. Forward keeps the travel to the hit frame (within
 * FORWARD_KEPT_SHARE of the room ahead), so the move still lands on the opponent.
 */
export function containPath({frames, hitFrame}: SequencePath, home: AnimationBounds, room: AnimationBounds): ContainedPath {
  const forward = beyond(frames, frame => frame.maxX - home.maxX), back = beyond(frames, frame => home.minX - frame.minX);
  const up = beyond(frames, frame => frame.maxY - home.maxY), down = beyond(frames, frame => home.minY - frame.minY);
  const ahead = room.maxX - home.maxX;
  const forwardTo = squeeze(forward, ahead, Math.min(forward[hitFrame] ?? 0, ahead * FORWARD_KEPT_SHARE));
  const backTo = squeeze(back, home.minX - room.minX, 0), upTo = squeeze(up, room.maxY - home.maxY, 0), downTo = squeeze(down, home.minY - room.minY, 0);
  const offsets = frames.map((_, i) => ({x: forwardTo[i] - forward[i] + back[i] - backTo[i], y: upTo[i] - up[i] + down[i] - downTo[i]}));
  const bounds = frames.reduce((union, frame, i) => frame.minX > frame.maxX ? union : unionBounds(union, {
    minX: frame.minX + offsets[i].x, maxX: frame.maxX + offsets[i].x, minY: frame.minY + offsets[i].y, maxY: frame.maxY + offsets[i].y,
  }), EMPTY_BOUNDS);
  return {offsets, bounds: bounds.minX > bounds.maxX ? home : bounds};
}
