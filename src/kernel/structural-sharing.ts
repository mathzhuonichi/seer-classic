// Structural sharing between snapshots, so screens that select an unchanged slice or row skip rendering.

const plain = (value: object) => Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype;

/**
 * Returns `next` with every part that equals the same part of `prev` replaced by `prev`'s object, recursively; when everything
 * is equal it returns `prev` itself. Only plain objects and arrays are compared (arrays by index); any other object keeps the
 * identity it was built with. Neither argument is modified.
 */
export function reuseUnchanged<T>(prev: T, next: T): T {
  if (Object.is(prev, next) || typeof prev !== 'object' || typeof next !== 'object' || !prev || !next) return next;
  if (!plain(prev) || !plain(next) || Array.isArray(prev) !== Array.isArray(next)) return next;
  if (Array.isArray(next)) {
    const before = prev as unknown[];
    let same = before.length === next.length;
    const kept = next.map((value, index) => {
      const item = index < before.length ? reuseUnchanged(before[index], value) : value;
      if (item !== before[index]) same = false;
      return item;
    });
    return (same ? prev : kept) as T;
  }
  const before = prev as Record<string, unknown>, after = next as Record<string, unknown>, kept: Record<string, unknown> = {};
  const keys = Object.keys(after);
  let same = keys.length === Object.keys(before).length;
  for (const key of keys) {
    const had = Object.hasOwn(before, key);
    kept[key] = had ? reuseUnchanged(before[key], after[key]) : after[key];
    if (!had || kept[key] !== before[key]) same = false;
  }
  return (same ? prev : kept) as T;
}

/**
 * Returns a function that shares each object it is given with the one it returned last (`reuseUnchanged`), field by field. A
 * field built as the same value as last time keeps the field it was shared into without being compared again: builders return
 * immutable views, and a memo that once rebuilt rows equal to the shared ones returns its own rows on every later build.
 */
export function fieldSharing<T extends object>(): (next: T) => T {
  let shared: Record<string, unknown> | undefined, built: Record<string, unknown> = {};
  return next => {
    const fields = { ...next } as Record<string, unknown>;
    if (shared) for (const key of Object.keys(fields)) if (fields[key] === built[key]) fields[key] = shared[key];
    built = { ...next } as Record<string, unknown>;
    shared = shared ? reuseUnchanged(shared, fields) : fields;
    return shared as T;
  };
}
