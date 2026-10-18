/** Scene geometry in percentages of the displayed background (0–100 on each axis). */
export interface ScenePoint { x: number; y: number }
export interface SceneBounds { left: number; top: number; right: number; bottom: number }
/** A screen rectangle, as returned by getBoundingClientRect. */
export interface ScreenRect { left: number; top: number; width: number; height: number }
/** A width and height in screen pixels. */
export interface Size { width: number; height: number }

export const point = (x: number, y: number): ScenePoint => ({ x, y });
export const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export const rectangle = (left: number, top: number, right: number, bottom: number): ScenePoint[] => [
  point(left, top), point(right, top), point(right, bottom), point(left, bottom),
];

export function polygonBounds(polygon: readonly ScenePoint[]): SceneBounds {
  const xs = polygon.map(vertex => vertex.x), ys = polygon.map(vertex => vertex.y);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

export function insidePolygon(polygon: readonly ScenePoint[], position: ScenePoint): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > position.y) !== (b.y > position.y) && position.x < (b.x - a.x) * (position.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The position itself when inside the polygon, otherwise the nearest point on its boundary. */
export function constrainToPolygon(polygon: readonly ScenePoint[], position: ScenePoint): ScenePoint {
  if (insidePolygon(polygon, position)) return position;
  let nearest = polygon[0], distance = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], dx = b.x - a.x, dy = b.y - a.y;
    const t = clamp(((position.x - a.x) * dx + (position.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const candidate = point(a.x + t * dx, a.y + t * dy), d = (candidate.x - position.x) ** 2 + (candidate.y - position.y) ** 2;
    if (d < distance) { distance = d; nearest = candidate; }
  }
  return nearest;
}

/** A screen point as a percentage of a screen rectangle. */
export const percentIn = (rect: ScreenRect, x: number, y: number): ScenePoint =>
  point((x - rect.left) / rect.width * 100, (y - rect.top) / rect.height * 100);
