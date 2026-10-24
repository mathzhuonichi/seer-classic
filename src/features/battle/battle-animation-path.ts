// How an original clip travels across the arena: each frame's body and extent, and the per-frame offsets that keep a move inside it.
import type {SwfClipData} from '@seer-pet-anim/swf-bundle';
import {EMPTY_BOUNDS, frameMeshBounds, unionBounds, type AnimationBounds} from './battle-animation-registration.ts';

type Mesh = Pick<SwfClipData['sequences'][number]['frames'][number]['mesh'], 'positions' | 'uvs' | 'indices' | 'mulColors'>;
type Clip = Pick<SwfClipData, 'sequences'>;
export interface Point {x: number; y: number}
/**
 * The creature's own parts lie within this many standby sizes of where the middle of its body went since the frame before
 * (or of the middle of its parts, where nothing of its body carries on); farther ones are parts it throws, such as a held
 * orb flung at the opponent.
 */
export const BODY_REACH = 1;
/**
 * Toward the opponent a move keeps its own travel up to where its hit lands, within this share of the room ahead, so the
 * creature still lands on the opponent; only the travel beyond is compressed into the rest of the room.
 */
export const FORWARD_KEPT_SHARE = 0.75;
/** Beyond the creature's own motion, its offset changes by at most this share of the standby size per frame. */
export const OFFSET_CREEP = 0.02;
/** A room without walls: nothing is compressed. */
export const OPEN_ROOM: AnimationBounds = {minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity};

/**
 * One sequence's frames: each frame's body, the creature's own parts (EMPTY_BOUNDS when nothing is visible), which must stay
 * inside the arena, and whether its own sprites draw it (`owned`; else sprites of the move redraw it); along each axis, how
 * far what the frame shows moved on from the frame before (`motions`, Infinity next to a frame that shows nothing) and how
 * far its body did (`bodyMotions`, bodyMotion); each frame's whole vertex extent, effects included, which the canvas must
 * hold; and the hit frame (-1: none).
 */
export interface SequencePath {
  bodies: AnimationBounds[]; owned: boolean[]; motions: Point[]; bodyMotions: Point[]; extents: AnimationBounds[]; hitFrame: number;
}
/** Per-frame offsets of a sequence (mesh units), and the whole extent of its frames once offset. */
export interface ContainedPath {offsets: Point[]; bounds: AnimationBounds}

/** One drawn copy of an atlas region: visible triangles sharing vertices, their area, centre and extent. */
interface Piece {region: string; area: number; x: number; y: number; bounds: AnimationBounds}

/** The atlas region a triangle draws: its UV rect. */
const regionOf = (uvs: ArrayLike<number>, [a, b, c]: number[]) =>
  `${Math.min(uvs[a * 2], uvs[b * 2], uvs[c * 2])},${Math.max(uvs[a * 2], uvs[b * 2], uvs[c * 2])},`
  + `${Math.min(uvs[a * 2 + 1], uvs[b * 2 + 1], uvs[c * 2 + 1])},${Math.max(uvs[a * 2 + 1], uvs[b * 2 + 1], uvs[c * 2 + 1])}`;

/** The pieces a frame draws: its visible triangles (any corner not fully transparent), joined where they share vertices. */
function framePieces({positions, uvs, indices, mulColors}: Mesh): Piece[] {
  const root = new Map<number, number>(), find = (v: number) => {
    while (root.has(v) && root.get(v) !== v) v = root.get(v)!;
    return v;
  };
  const triangles: number[][] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const corners = [indices[t], indices[t + 1], indices[t + 2]];
    if (corners.every(v => mulColors[v * 4 + 3] === 0)) continue;
    triangles.push(corners);
    for (const v of corners.slice(1)) root.set(find(v), find(corners[0]));
  }
  const pieces = new Map<number, Piece>();
  for (const corners of triangles) {
    const [a, b, c] = corners.map(v => ({x: positions[v * 2], y: positions[v * 2 + 1]}));
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2, key = find(corners[0]);
    const piece = pieces.get(key) ?? {region: regionOf(uvs, corners), area: 0, x: a.x, y: a.y, bounds: EMPTY_BOUNDS};
    const total = piece.area + area, share = total ? area / total : 0;
    const extent = {minX: Math.min(a.x, b.x, c.x), maxX: Math.max(a.x, b.x, c.x), minY: Math.min(a.y, b.y, c.y), maxY: Math.max(a.y, b.y, c.y)};
    pieces.set(key, {region: piece.region, area: total, bounds: unionBounds(piece.bounds, extent),
      x: piece.x + ((a.x + b.x + c.x) / 3 - piece.x) * share, y: piece.y + ((a.y + b.y + c.y) / 3 - piece.y) * share});
  }
  return [...pieces.values()];
}

/** The value at half the total weight. */
function weightedMedian(entries: [value: number, weight: number][]): number {
  entries.sort((a, b) => a[0] - b[0]);
  let remaining = entries.reduce((sum, [, weight]) => sum + weight, 0) / 2;
  for (const [value, weight] of entries) if ((remaining -= weight) <= 0) return value;
  return entries[entries.length - 1][0];
}
/** Squared distance, which orders distances as they do. */
const apart = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
/** The index of the place nearest `point`. */
function nearest(point: Point, places: Point[]) {
  let best = 0;
  for (let i = 1; i < places.length; i++) if (apart(places[i], point) < apart(places[best], point)) best = i;
  return best;
}

/** The pieces by region, in drawing order. */
function byRegion(pieces: Piece[]) {
  const regions = new Map<string, Piece[]>();
  for (const piece of pieces) {
    const copies = regions.get(piece.region);
    if (copies) copies.push(piece);
    else regions.set(piece.region, [piece]);
  }
  return regions;
}

/** A region of the creature's own: where the standby first draws it, and the most copies one standby frame draws. */
interface OwnRegion {home: Piece[]; copies: number}
/** The creature's own regions: those its standby draws. A region only a move draws is an effect. */
function creatureRegions(clip: Clip): Map<string, OwnRegion> {
  const standby = clip.sequences.find(s => s.name === 'standby') ?? clip.sequences[0], regions = new Map<string, OwnRegion>();
  for (const frame of standby.frames) for (const [region, pieces] of byRegion(framePieces(frame.mesh))) {
    const known = regions.get(region);
    regions.set(region, {home: known?.home ?? pieces, copies: Math.max(known?.copies ?? 0, pieces.length)});
  }
  return regions;
}

/**
 * The creature's own pieces among the pieces of its regions in a frame. A region drawn more often than the standby ever does
 * is the creature plus copies of it (afterimages, clones): the creature is the copies nearest where it had that part before.
 */
function ownPieces(pieces: Piece[], regions: Map<string, OwnRegion>, before: Map<string, Piece[]>): Piece[] {
  return [...byRegion(pieces)].flatMap(([region, copies]) => {
    const {home, copies: count} = regions.get(region)!, places = before.get(region) ?? home;
    if (copies.length <= count) return copies;
    const away = new Map(copies.map(copy => [copy, apart(copy, places[nearest(copy, places)])]));
    return copies.sort((a, b) => away.get(a)! - away.get(b)!).slice(0, count);
  });
}

/**
 * The copies of one region in two frames, paired: in drawing order while their number holds (a timeline keeps its layers),
 * else the nearest pairs first, so a copy that appears or vanishes leaves the others paired with themselves.
 */
function pairs(from: Piece[], to: Piece[]): [Piece, Piece][] {
  if (from.length === to.length) return to.map((piece, i) => [from[i], piece]);
  const near = from.flatMap(a => to.map(b => [apart(a, b), a, b] as const)).sort((x, y) => x[0] - y[0]), used = new Set<Piece>();
  return near.flatMap(([, a, b]): [Piece, Piece][] => used.has(a) || used.has(b) ? [] : (used.add(a).add(b), [[a, b]]));
}

/** A piece of one frame and the piece of the frame before that it continues. */
type Link = [before: Piece, piece: Piece];
/** Each piece of `to` linked to the piece of `from` it continues, region by region (`pairs`). */
function links(from: Piece[], to: Piece[]): Link[] {
  const earlier = byRegion(from);
  return [...byRegion(to)].flatMap(([region, copies]) => pairs(earlier.get(region) ?? [], copies));
}
/** How far linked pieces moved, area-weighted median per axis, signed or not; null without a link. */
function displacement(linked: Link[], signed = false): Point | null {
  if (!linked.length) return null;
  const by = (axis: 'x' | 'y') => weightedMedian(linked.map(([before, piece]) => [piece[axis] - before[axis], piece.area]));
  const x = by('x'), y = by('y');
  return signed ? {x, y} : {x: Math.abs(x), y: Math.abs(y)};
}
/** How far the pieces of regions drawn in both frames moved; null when no region is in both. */
const shift = (from: Piece[], to: Piece[]) => displacement(links(from, to));

/** No limit, where nothing visible carries on from one frame to the next; no motion, into a sequence from the resting pose. */
const FREE: Point = {x: Infinity, y: Infinity}, STILL: Point = {x: 0, y: 0};
const overlap = (a: AnimationBounds, b: AnimationBounds) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;
const extentOf = (pieces: Piece[]) => pieces.reduce((union, piece) => unionBounds(union, piece.bounds), EMPTY_BOUNDS);
const largest = (pieces: Piece[]) => pieces.reduce((a, b) => b.area > a.area ? b : a);
/** Motion between frames that share no region: a drawing redrawn in place moved as its largest piece did; one drawn elsewhere carries nothing on. */
function redrawn(from: Piece[], to: Piece[]): Point {
  if (!overlap(extentOf(from), extentOf(to))) return FREE;
  const a = largest(from), b = largest(to);
  return {x: Math.abs(b.x - a.x), y: Math.abs(b.y - a.y)};
}

/** The creature's body in a frame: its pieces, their area-weighted middle, and whether they are its own sprites. */
interface Body {pieces: Piece[]; middle: Point; own: boolean}
const middleOf = (pieces: Piece[]): Point => ({x: weightedMedian(pieces.map(p => [p.x, p.area])), y: weightedMedian(pieces.map(p => [p.y, p.area]))});
/**
 * The body among a frame's `candidates`: those within `reach` of where the body's middle went with the pieces that carry it
 * on from the frame before (`linked`), so a part it throws or a copy of it does not take the body over; where nothing of
 * the body carries on, those within reach of the candidates' middle.
 */
function bodyAmong(candidates: Piece[], own: boolean, previous: Body | null, linked: Link[], reach: number): Body {
  const near = (middle: Point) => candidates.filter(piece => apart(piece, middle) <= reach ** 2);
  const kept = new Set(previous?.pieces), step = previous && displacement(linked.filter(([before]) => kept.has(before)), true);
  const carried = step && previous ? near({x: previous.middle.x + step.x, y: previous.middle.y + step.y}) : [];
  const middle = middleOf(candidates), pieces = carried.length ? carried : near(middle);
  return {pieces, middle: pieces.length ? middleOf(pieces) : middle, own};
}
/**
 * How far the creature's own body moved into a frame, which the offset may follow beyond what the frame shows moving on:
 * where the body shares a part with the body before, as its pieces moved (a copy that takes it over, as that copy did);
 * where other parts of the creature take it over, as its largest piece moved, and freely where the two do not overlap;
 * and freely where it appears after a frame without it. A body of sprites the move draws instead of the creature's own
 * lends the offset nothing.
 */
function bodyMotion(body: Body | null, last: Body | null, linked: Link[]): Point {
  if (!body?.own) return STILL;
  if (!last?.own) return FREE;
  const parts = new Set(last.pieces.map(piece => piece.region)), pieces = new Set(body.pieces);
  if (!body.pieces.some(piece => parts.has(piece.region))) return redrawn(last.pieces, body.pieces);
  return displacement(linked.filter(([, piece]) => pieces.has(piece))) ?? STILL;
}
/**
 * Each sequence's path, by sequence name; `home` is the standby extent, whose size scales BODY_REACH, and `hitFrames` each
 * sequence's hit frame by name (battleAnimationHitFrames; a sequence it lacks has none). A frame's body is its own pieces
 * (all it draws when it draws none, as a move that redraws the whole creature does), followed from frame to frame. What a
 * frame shows moved on as the pieces of the creature's regions did, copies included, as they all show it; else as any
 * piece both frames draw did; else, for a creature redrawn frame by frame, as its largest piece did, and without limit
 * when the drawings do not overlap. Its body can move farther (bodyMotion).
 */
export function sequencePaths(clip: Clip, home: AnimationBounds, hitFrames: ReadonlyMap<string, number>): Map<string, SequencePath> {
  const reach = BODY_REACH * Math.max(home.maxX - home.minX, home.maxY - home.minY), regions = creatureRegions(clip);
  return new Map(clip.sequences.filter(s => s.frames.length).map(s => {
    let before = new Map<string, Piece[]>(), previous: Body | null = null;
    const drawn = s.frames.map(frame => framePieces(frame.mesh)), creature = drawn.map(pieces => pieces.filter(piece => regions.has(piece.region)));
    const linked = creature.map((pieces, i) => i ? links(creature[i - 1], pieces) : []);
    const tracked = drawn.map((pieces, i) => {
      const own = ownPieces(creature[i], regions, before);
      if (own.length) before = byRegion(own);
      const body = pieces.length ? bodyAmong(own.length ? own : pieces, own.length > 0, previous, linked[i], reach) : null;
      return previous = body?.pieces.length ? body : null;
    });
    const motions = drawn.map((pieces, i) => !i ? STILL : !pieces.length || !drawn[i - 1].length ? FREE
      : displacement(linked[i]) ?? shift(drawn[i - 1], pieces) ?? redrawn(drawn[i - 1], pieces));
    return [s.name, {
      bodies: tracked.map(body => body ? extentOf(body.pieces) : EMPTY_BOUNDS), owned: tracked.map(body => !!body?.own), motions,
      bodyMotions: tracked.map((body, i) => i ? bodyMotion(body, tracked[i - 1], linked[i]) : STILL),
      extents: s.frames.map(frameMeshBounds), hitFrame: hitFrames.get(s.name) ?? -1,
    }];
  }));
}

/** How far each body reaches beyond the home extent on one side (0 for a body inside it or an empty one). */
const beyond = (bodies: AnimationBounds[], reach: (body: AnimationBounds) => number) =>
  bodies.map(body => body.minX > body.maxX ? 0 : Math.max(0, reach(body)));

/** Reaches squeezed into `room`: when the farthest does not fit, those up to `kept` stay and the rest scale linearly into what is left. */
function squeeze(reaches: number[], room: number, kept: number): number[] {
  const farthest = Math.max(0, ...reaches), space = Math.max(0, room);
  if (farthest <= space) return reaches;
  const knee = Math.min(Math.max(0, kept), space), rate = (space - knee) / (farthest - knee);
  return reaches.map(reach => reach <= knee ? reach : knee + (reach - knee) * rate);
}

/** `offset` changed as little as keeps [min, max] + offset within [low, high], or covering it when it is wider. */
function within(offset: number, min: number, max: number, low: number, high: number) {
  const atLow = low - min, atHigh = high - max;
  return Math.min(Math.max(offset, Math.min(atLow, atHigh)), Math.max(atLow, atHigh));
}

/** An offset's limits on one axis in one frame: at least `low` and at most `high`. */
export interface Band {low: number; high: number}
/** No limit. */
const ANYWHERE: Band = {low: -Infinity, high: Infinity};

/**
 * Offsets within `bands` that change by at most `steps[i]` into frame i, from no offset before the first frame (the resting
 * pose) and back to none after the last (`steps[bands.length]`). Each band binds the frames around it, loosening by a step
 * per frame, so the offset reaches it in time. Where `eases` (at most the steps) are enough, the offset eases into each band
 * that far ahead and back to rest by them; elsewhere it changes by more, but only as far as the bands make it. Where opposite
 * limits come too close the lower one wins (upward, forward). Near the ends the offset is held within what the steps allow
 * from and back to rest, even where that leaves a band unmet.
 */
export function limitRate(bands: Band[], steps: number[], eases: number[] = steps): number[] {
  const spread = (by: number[], forward: boolean): Band[] => {
    const low = bands.map(band => band.low), high = bands.map(band => band.high);
    for (let i = 1; forward && i < bands.length; i++) {
      low[i] = Math.max(low[i], low[i - 1] - by[i]); high[i] = Math.min(high[i], high[i - 1] + by[i]);
    }
    for (let i = bands.length - 2; i >= 0; i--) {
      low[i] = Math.max(low[i], low[i + 1] - by[i + 1]); high[i] = Math.min(high[i], high[i + 1] + by[i + 1]);
    }
    return low.map((bound, i) => ({low: bound, high: high[i]}));
  };
  // The hard bands must hold; the soft ones are how far ahead the offset eases into a band, while it eases out by itself.
  const hard = spread(steps, true), soft = spread(eases, false), toRest = bands.map(() => 0);
  for (let i = bands.length - 1, sum = 0; i >= 0; i--) toRest[i] = sum += steps[i + 1];
  const into = (value: number, {low, high}: Band) => Math.max(low, Math.min(value, high));
  let fromRest = 0, offset = 0;
  return bands.map((_, i) => {
    const reach = Math.min(fromRest += steps[i], toRest[i]);
    const eased = offset > 0 ? Math.max(0, offset - eases[i]) : Math.min(0, offset + eases[i]), ease = {low: offset - eases[i], high: offset + eases[i]};
    return offset = Math.min(Math.max(into(into(into(eased, soft[i]), ease), hard[i]), -reach), reach);
  });
}

/**
 * Per-frame bands that bring the bodies' travel inside `room`, as containPath describes: at least as far as the compressed
 * travel's offset in its direction, and, for a body of the creature's own sprites, no farther than keeps it inside
 * (covering the room, where it is wider).
 */
function travelBands({bodies, owned, hitFrame}: SequencePath, home: AnimationBounds, room: AnimationBounds): {x: Band; y: Band}[] {
  const forward = beyond(bodies, body => body.maxX - home.maxX), back = beyond(bodies, body => home.minX - body.minX);
  const up = beyond(bodies, body => body.maxY - home.maxY), down = beyond(bodies, body => home.minY - body.minY);
  const ahead = room.maxX - home.maxX;
  const forwardTo = squeeze(forward, ahead, Math.min(forward[hitFrame] ?? 0, ahead * FORWARD_KEPT_SHARE));
  const backTo = squeeze(back, home.minX - room.minX, 0), upTo = squeeze(up, room.maxY - home.maxY, 0), downTo = squeeze(down, home.minY - room.minY, 0);
  const allowed = unionBounds(room, home);
  const band = (inside: boolean, travel: number, min: number, max: number, low: number, high: number): Band => {
    const target = within(travel, min, max, low, high), fits = inside ? [low - min, high - max] : [-Infinity, Infinity];
    return {low: Math.max(target > 0 ? target : -Infinity, Math.min(...fits)), high: Math.min(target < 0 ? target : Infinity, Math.max(...fits))};
  };
  return bodies.map((body, i) => body.minX > body.maxX ? {x: ANYWHERE, y: ANYWHERE} : {
    x: band(owned[i], forwardTo[i] - forward[i] + back[i] - backTo[i], body.minX, body.maxX, allowed.minX, allowed.maxX),
    y: band(owned[i], upTo[i] - up[i] + down[i] - downTo[i], body.minY, body.maxY, allowed.minY, allowed.maxY),
  });
}

/**
 * Offsets that bring a sequence's travel inside `room` (mesh units, x forward, y up) by compressing it on each side it
 * overflows; the creature keeps its size and pose. `home` is the standby extent the travel is measured from: frames within it
 * do not move. Up, down and back compress linearly from home. Forward keeps the travel to the hit frame (within
 * FORWARD_KEPT_SHARE of the room ahead), so the move still lands on the opponent. A frame that reaches past home on both
 * sides of an axis can still overflow once the other side's compression moves it; it moves back just inside the room (or
 * home, where home itself reaches beyond the room). A body of the creature's own sprites then stays inside on every frame:
 * no offset pushes it out on the other side. The offsets change between frames no faster than what the frame shows moves on
 * plus OFFSET_CREEP, so a body that changes shape at once (a part appears or vanishes) eases instead of jumping; where that
 * leaves the body outside, as fast as the body itself moves, appears or is taken over (bodyMotion), and copies and effects
 * then move with it.
 */
export function containPath(path: SequencePath, home: AnimationBounds, room: AnimationBounds): ContainedPath {
  const bands = travelBands(path, home, room), creep = OFFSET_CREEP * Math.max(home.maxX - home.minX, home.maxY - home.minY);
  const along = (axis: 'x' | 'y') => {
    const steps = path.motions.map((motion, i) => Math.max(motion[axis], path.bodyMotions[i][axis]) + creep);
    return limitRate(bands.map(band => band[axis]), [...steps, creep], [...path.motions.map(motion => motion[axis] + creep), creep]);
  };
  const xs = along('x'), ys = along('y');
  const offsets = xs.map((x, i) => ({x, y: ys[i]}));
  const bounds = path.extents.reduce((union, extent, i) => extent.minX > extent.maxX ? union : unionBounds(union, {
    minX: extent.minX + offsets[i].x, maxX: extent.maxX + offsets[i].x, minY: extent.minY + offsets[i].y, maxY: extent.maxY + offsets[i].y,
  }), EMPTY_BOUNDS);
  return {offsets, bounds: bounds.minX > bounds.maxX ? home : bounds};
}
