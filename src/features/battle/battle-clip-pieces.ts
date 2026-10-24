// The pieces an original clip's frame draws, each a copy of one atlas region, and how they carry on from frame to frame.
import type {SwfClipData} from '@seer-pet-anim/swf-bundle';
import {EMPTY_BOUNDS, type AnimationBounds} from './battle-animation-registration.ts';

type Mesh = Pick<SwfClipData['sequences'][number]['frames'][number]['mesh'], 'positions' | 'uvs' | 'indices' | 'mulColors'>;
export interface Point {x: number; y: number}

/** One drawn copy of an atlas region: visible triangles sharing vertices, their area, centre and extent. */
export interface Piece {region: number; area: number; x: number; y: number; bounds: AnimationBounds}

/** The atlas regions of one clip, each UV rect numbered once (in the order first met), so pieces compare regions as numbers. */
export class Regions {
  private readonly rects: number[] = [];
  private readonly buckets = new Map<number, number[]>();
  private readonly bits = new Float64Array(1);
  private readonly words = new Uint32Array(this.bits.buffer);
  /** The number of the rect [minU, maxU] x [minV, maxV]; -0 and 0 are one value. */
  id(minU: number, maxU: number, minV: number, maxV: number): number {
    const mix = (hash: number, value: number) => {
      this.bits[0] = value + 0;
      return Math.imul(hash ^ this.words[0], 0x9e3779b1) ^ Math.imul(this.words[1], 0x85ebca6b);
    };
    const hash = mix(mix(mix(mix(0, minU), maxU), minV), maxV);
    const bucket = this.buckets.get(hash), {rects} = this;
    for (const id of bucket ?? []) {
      if (rects[id * 4] === minU && rects[id * 4 + 1] === maxU && rects[id * 4 + 2] === minV && rects[id * 4 + 3] === maxV) return id;
    }
    const id = rects.length / 4;
    rects.push(minU, maxU, minV, maxV);
    if (bucket) bucket.push(id); else this.buckets.set(hash, [id]);
    return id;
  }
}

/** The atlas region a triangle draws: its UV rect. */
const regionOf = (regions: Regions, uvs: ArrayLike<number>, a: number, b: number, c: number) => regions.id(
  Math.min(uvs[a * 2], uvs[b * 2], uvs[c * 2]), Math.max(uvs[a * 2], uvs[b * 2], uvs[c * 2]),
  Math.min(uvs[a * 2 + 1], uvs[b * 2 + 1], uvs[c * 2 + 1]), Math.max(uvs[a * 2 + 1], uvs[b * 2 + 1], uvs[c * 2 + 1]));

/** The pieces a frame draws: its visible triangles (any corner not fully transparent), joined where they share vertices. */
export function framePieces({positions, uvs, indices, mulColors}: Mesh, regions: Regions): Piece[] {
  const root = new Int32Array(positions.length / 2).fill(-1), find = (v: number) => {
    let top = v;
    while (root[top] >= 0) top = root[top];
    while (root[v] >= 0) { const next = root[v]; root[v] = top; v = next; }
    return top;
  };
  const triangles: number[] = [];
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (mulColors[a * 4 + 3] === 0 && mulColors[b * 4 + 3] === 0 && mulColors[c * 4 + 3] === 0) continue;
    triangles.push(t);
    const top = find(a), second = find(b);
    if (second !== top) root[second] = top;
    const third = find(c);
    if (third !== top) root[third] = top;
  }
  // Each set's piece, by its root vertex, in the order its first triangle comes.
  const pieceOf = new Int32Array(root.length).fill(-1), pieces: Piece[] = [];
  for (const t of triangles) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2], key = find(a);
    const ax = positions[a * 2], ay = positions[a * 2 + 1], bx = positions[b * 2], by = positions[b * 2 + 1], cx = positions[c * 2], cy = positions[c * 2 + 1];
    const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
    if (pieceOf[key] < 0) {
      pieceOf[key] = pieces.length;
      pieces.push({region: regionOf(regions, uvs, a, b, c), area: 0, x: ax, y: ay, bounds: {...EMPTY_BOUNDS}});
    }
    const piece = pieces[pieceOf[key]], total = piece.area + area, share = total ? area / total : 0, {bounds} = piece;
    bounds.minX = Math.min(bounds.minX, ax, bx, cx); bounds.maxX = Math.max(bounds.maxX, ax, bx, cx);
    bounds.minY = Math.min(bounds.minY, ay, by, cy); bounds.maxY = Math.max(bounds.maxY, ay, by, cy);
    piece.area = total;
    piece.x = piece.x + ((ax + bx + cx) / 3 - piece.x) * share; piece.y = piece.y + ((ay + by + cy) / 3 - piece.y) * share;
  }
  return pieces;
}

/** Where weightedMedian sorts the indices of its values; kept from call to call and grown as needed. */
let sortSpace = new Uint32Array(512);
/** The value at half the total weight, the weights summed in the order of the values (ties in the order given). */
function weightedMedian(values: Float64Array, weights: Float64Array): number {
  const n = values.length;
  if (sortSpace.length < 2 * n) sortSpace = new Uint32Array(4 * n);
  let order = sortSpace.subarray(0, n), merged = sortSpace.subarray(n, 2 * n);
  for (let i = 0; i < n; i++) order[i] = i;
  // A bottom-up merge sort: stable, so equal values keep their order.
  for (let width = 1; width < n; width *= 2) {
    for (let low = 0; low < n; low += 2 * width) {
      const middle = Math.min(low + width, n), high = Math.min(low + 2 * width, n);
      let i = low, j = middle, k = low;
      while (i < middle && j < high) merged[k++] = values[order[j]] < values[order[i]] ? order[j++] : order[i++];
      while (i < middle) merged[k++] = order[i++];
      while (j < high) merged[k++] = order[j++];
    }
    [order, merged] = [merged, order];
  }
  let remaining = 0;
  for (let k = 0; k < n; k++) remaining += weights[order[k]];
  remaining /= 2;
  for (let k = 0; k < n; k++) if ((remaining -= weights[order[k]]) <= 0) return values[order[k]];
  return values[order[n - 1]];
}
/** Squared distance, which orders distances as they do. */
export const apart = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
/** The index of the place nearest `point`. */
export function nearest(point: Point, places: Point[]) {
  let best = 0;
  for (let i = 1; i < places.length; i++) if (apart(places[i], point) < apart(places[best], point)) best = i;
  return best;
}

/** The pieces by region, in drawing order. */
export function byRegion(pieces: Piece[]) {
  const regions = new Map<number, Piece[]>();
  for (const piece of pieces) {
    const copies = regions.get(piece.region);
    if (copies) copies.push(piece);
    else regions.set(piece.region, [piece]);
  }
  return regions;
}

/**
 * The copies of one region in two frames, paired: in drawing order while their number holds (a timeline keeps its layers),
 * else the nearest pairs first, so a copy that appears or vanishes leaves the others paired with themselves.
 */
function pairs(from: Piece[], to: Piece[]): [Piece, Piece][] {
  if (from.length === to.length) return to.map((piece, i) => [from[i], piece]);
  const n = from.length, m = to.length, gap = new Float64Array(n * m);
  for (let a = 0; a < n; a++) {
    const {x, y} = from[a];
    for (let b = 0; b < m; b++) gap[a * m + b] = (x - to[b].x) ** 2 + (y - to[b].y) ** 2;
  }
  // Pairs go in the order of their distance, then of their place in from x to: the order a stable sort of all pairs gives.
  // A pair whose two pieces are each other's nearest in that order is one the greedy order takes, so follow nearest
  // neighbours to one, keeping each piece's nearest until it is taken.
  const freeA = new Uint8Array(n).fill(1), freeB = new Uint8Array(m).fill(1), nearB = new Int32Array(n).fill(-1), nearA = new Int32Array(m).fill(-1);
  const nearestB = (a: number) => {
    let best = nearB[a];
    if (best >= 0 && freeB[best]) return best;
    let least = Infinity;
    for (let b = 0, row = a * m; b < m; b++) if (freeB[b] && gap[row + b] < least) { least = gap[row + b]; best = b; }
    return nearB[a] = best;
  };
  const nearestA = (b: number) => {
    let best = nearA[b];
    if (best >= 0 && freeA[best]) return best;
    let least = Infinity;
    for (let a = 0, cell = b; a < n; a++, cell += m) if (freeA[a] && gap[cell] < least) { least = gap[cell]; best = a; }
    return nearA[b] = best;
  };
  const taken: number[] = [];
  for (let left = Math.min(n, m), a = 0; left > 0; left--, a = 0) {
    while (!freeA[a]) a++;
    let b = nearestB(a), back = nearestA(b);
    while (back !== a) { a = back; b = nearestB(a); back = nearestA(b); }
    freeA[a] = 0; freeB[b] = 0; taken.push(a * m + b);
  }
  return taken.sort((p, q) => gap[p] - gap[q] || p - q).map(p => [from[Math.floor(p / m)], to[p % m]]);
}

/** A piece of one frame and the piece of the frame before that it continues. */
export type Link = [before: Piece, piece: Piece];
/** Each piece of `to` linked to the piece of `from` it continues, region by region (`pairs`). */
export function links(from: Piece[], to: Piece[]): Link[] {
  const earlier = byRegion(from);
  return [...byRegion(to)].flatMap(([region, copies]) => pairs(earlier.get(region) ?? [], copies));
}
/** How far linked pieces moved, area-weighted median per axis (signed); null without a link. */
export function moved(linked: Link[]): Point | null {
  if (!linked.length) return null;
  const xs = new Float64Array(linked.length), ys = new Float64Array(linked.length), areas = new Float64Array(linked.length);
  linked.forEach(([before, piece], i) => { xs[i] = piece.x - before.x; ys[i] = piece.y - before.y; areas[i] = piece.area; });
  return {x: weightedMedian(xs, areas), y: weightedMedian(ys, areas)};
}
/** A move's size along each axis. */
export const sized = (point: Point | null) => point && {x: Math.abs(point.x), y: Math.abs(point.y)};
/** The links among `linked` that `keep` keeps, and how far they moved: the whole list's `motion` when it keeps them all. */
export function movedOf(linked: Link[], motion: Point | null, keep: (link: Link) => boolean): Point | null {
  const kept = linked.filter(keep);
  return kept.length === linked.length ? motion : moved(kept);
}
/** How far the pieces of regions drawn in both frames moved; null when no region is in both. */
export const shift = (from: Piece[], to: Piece[]) => sized(moved(links(from, to)));
/** The pieces' area-weighted middle. */
export function middleOf(pieces: Piece[]): Point {
  const xs = new Float64Array(pieces.length), ys = new Float64Array(pieces.length), areas = new Float64Array(pieces.length);
  pieces.forEach((piece, i) => { xs[i] = piece.x; ys[i] = piece.y; areas[i] = piece.area; });
  return {x: weightedMedian(xs, areas), y: weightedMedian(ys, areas)};
}
