import type { TypeData, TypeId } from './types.ts';

export function single(data: TypeData, atk: TypeId, def: TypeId): number {
  return data.chart[atk]?.[def] ?? 1;
}

/** Resolve catalog composite identifiers without changing the single-type API. */
export function attackTypes(data: TypeData, type: TypeId | TypeId[]): TypeId[] {
  return [...new Set((Array.isArray(type) ? type : [type]).flatMap(id => data.composites?.[id] ?? [id]))];
}

/** Base-type rules match either constituent; composite rules match the full pair. */
export function hasAttackType(data: TypeData, attack: TypeId | TypeId[], expected: TypeId): boolean {
  const types = attackTypes(data, attack), required = attackTypes(data, expected);
  return required.length === 1 ? types.includes(required[0]) : types.length === required.length && required.every(type => types.includes(type));
}

export function typeIdentity(data: TypeData, type: TypeId | TypeId[]): string {
  return attackTypes(data, type).sort().join('+');
}

// Seer's dual-type rule (RULES.md section 6): average the coefficients;
// both 2 -> 4; any 0 -> average / 2.
function combine(coefs: number[]): number {
  if (coefs.length === 1) return coefs[0];
  const mean = coefs.reduce((a, b) => a + b, 0) / coefs.length;
  if (coefs.every((c) => c === 2)) return 4;
  if (coefs.some((c) => c === 0)) return mean / 2;
  return mean;
}

export function effectiveness(data: TypeData, attack: TypeId | TypeId[], defend: TypeId[]): number {
  const atks = attackTypes(data, attack);
  if (atks.length === 1) return combine(defend.map((d) => single(data, atks[0], d)));
  // dual attacker vs single defender: combine over attacking types;
  // vs dual defender: average the per-defending-type results.
  const perDef = defend.map((d) => combine(atks.map((a) => single(data, a, d))));
  return perDef.length === 1 ? perDef[0] : perDef.reduce((a, b) => a + b, 0) / perDef.length;
}
