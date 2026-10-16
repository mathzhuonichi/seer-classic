// Battle clone for engine-simulated search (design/notes/trainer-search-ai-v58.md 12.1).
//
// The copy is generic: every own enumerable field is deep-copied unless it is
// static data listed below, so plain-data fields added to Battle later (for
// example `journal`) are copied without changes here. Functions are shared.
//
// Shared by reference:
// - Battle fields `data`, `scripts`, `encounter`, `variant`;
// - any field named `def` (condition definitions) or `species`;
// - catalog entries reachable through `data` (species, skills, condition defs,
//   items, natures, the type chart) and STRUGGLE_SKILL, wherever they appear,
//   so identity comparisons such as `lastKo.skill === skill` keep working.
// Copied shallowly: `log` and `initialEvents` (events are immutable once emitted).
//
// Aliasing inside the mutable state is preserved: an object reached twice is
// copied once (for example `lastKo.target` and the monster in its team, or a
// charge pool shared by several conditions). Prototypes are preserved, so the
// copy is a Battle with its own Rng.
//
// Shared objects must never be mutated during a battle. V58 audit of the engine
// and every script registry (seer-main, seer-tail, boss, boss-recovered,
// npc-training, traits, campaign-rules; engravings only build skills before
// battle):
// - Condition defs, including inline ones from scriptCondition/sc/plain, boss,
//   campaign and NPC installs, energy beads and game.ts traits, are never
//   changed after addCondition. Per-instance state lives in the copied
//   ActiveCondition (`turns`, `charges`, `data`).
// - No script or engine path writes to a species, catalog skill, item, hook
//   params or `data`; `transform` replaces `mon.species` instead of editing it.
//   `skillOverrides` are per-battle copies and are copied here as well.
// - `cond.data`, `vol` and `persist` hold plain data only, no closures. Shared
//   sub-objects (seer_eff_71's team charge pool) keep their aliasing.
// - Module-level state: only seer-tail's `reflecting` guard, set and reset
//   synchronously inside one seer_eff_191 hook; the AI never runs inside it.
// - Functions are shared, so a function stored on Battle (such as a future
//   `conventionalMoves`) must not capture one battle's mutable state.
// Fields must stay ordinary own properties: `#private` fields would be skipped.
// tools/verification/battle-clone-fidelity-v58.mjs checks all of this.

import type { Battle } from './battle.ts';
import { STRUGGLE_SKILL } from './battle.ts';
import type { DataSet } from './types.ts';

const SHARED_BATTLE_FIELDS = new Set(['data', 'scripts', 'encounter', 'variant']);
const EVENT_LIST_FIELDS = new Set(['log', 'initialEvents']);
const SHARED_FIELDS = new Set(['def', 'species']);

interface CloneContext {
  shared: Set<object>;
  memo: Map<object, unknown>;
}

const staticByData = new WeakMap<DataSet, Set<object>>();

/** Catalog objects that state may point at; built once per DataSet. */
function staticObjects(data: DataSet): Set<object> {
  let set = staticByData.get(data);
  if (set) return set;
  set = new Set<object>([STRUGGLE_SKILL]);
  for (const map of [data.species, data.skills, data.conditions, data.items, data.natures] as Map<unknown, object>[]) {
    if (!map) continue;
    set.add(map);
    for (const value of map.values()) set.add(value);
  }
  if (data.types) set.add(data.types);
  set.add(data);
  staticByData.set(data, set);
  return set;
}

function unsupported(value: object): never {
  throw new Error(`cloneBattle: unsupported object ${Object.prototype.toString.call(value)}`);
}

function copyValue(value: unknown, ctx: CloneContext): unknown {
  if (typeof value !== 'object' || value === null) return value; // primitives and functions
  if (ctx.shared.has(value)) return value;
  const seen = ctx.memo.get(value);
  if (seen !== undefined) return seen;

  if (Array.isArray(value)) {
    const out = new Array(value.length);
    ctx.memo.set(value, out);
    for (let i = 0; i < value.length; i++) out[i] = copyValue(value[i], ctx);
    return out;
  }
  const proto = Object.getPrototypeOf(value);
  if (proto === Object.prototype || proto === null) return copyObject(value as Record<string, unknown>, proto, ctx);
  if (value instanceof Map) {
    const out = new Map();
    ctx.memo.set(value, out);
    for (const [k, v] of value) out.set(copyValue(k, ctx), copyValue(v, ctx));
    return out;
  }
  if (value instanceof Set) {
    const out = new Set();
    ctx.memo.set(value, out);
    for (const v of value) out.add(copyValue(v, ctx));
    return out;
  }
  if (value instanceof Date) {
    const out = new Date(value.getTime());
    ctx.memo.set(value, out);
    return out;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof WeakMap ||
      value instanceof WeakSet || value instanceof Promise || value instanceof RegExp) unsupported(value);
  // Class instances (Rng, Battle-owned helpers): same prototype, copied own fields.
  return copyObject(value as Record<string, unknown>, proto, ctx);
}

function copyObject(value: Record<string, unknown>, proto: object | null, ctx: CloneContext): Record<string, unknown> {
  const out: Record<string, unknown> = proto === Object.prototype ? {} : Object.create(proto);
  ctx.memo.set(value, out);
  for (const key of Object.keys(value)) {
    const v = value[key];
    out[key] = SHARED_FIELDS.has(key) ? v : copyValue(v, ctx);
  }
  return out;
}

/** A fully independent copy of `b` that shares only static data (see the header). */
export function cloneBattle(b: Battle): Battle {
  const ctx: CloneContext = { shared: staticObjects(b.data), memo: new Map() };
  const source = b as unknown as Record<string, unknown>;
  const out = Object.create(Object.getPrototypeOf(b)) as Record<string, unknown>;
  ctx.memo.set(b, out);
  for (const key of Object.keys(source)) {
    const v = source[key];
    if (SHARED_BATTLE_FIELDS.has(key) || SHARED_FIELDS.has(key)) out[key] = v;
    else if (EVENT_LIST_FIELDS.has(key) && Array.isArray(v)) out[key] = v.slice();
    else out[key] = copyValue(v, ctx);
  }
  return out as unknown as Battle;
}
