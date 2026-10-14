// Builds an indexed DataSet from plain JSON-shaped objects. Loading files is
// the host's job (see tools/load-data.ts for Node); the core never touches I/O.

import type { ConditionDef, DataSet, Item, Nature, Skill, Species, TypeData } from './types.ts';
import { BUILTIN_CONDITIONS } from './builtin-conditions.ts';

export interface RawData {
  species?: Species[];
  skills?: Skill[];
  natures?: Nature[];
  types: TypeData;
  conditions?: ConditionDef[];
  items?: Item[];
}

export function buildDataSet(raw: RawData): DataSet {
  const conditions = new Map<string, ConditionDef>();
  for (const c of BUILTIN_CONDITIONS) conditions.set(c.id, c);
  for (const c of raw.conditions ?? []) conditions.set(c.id, c);
  return {
    species: new Map((raw.species ?? []).map((s) => [s.id, s])),
    skills: new Map((raw.skills ?? []).map((s) => [s.id, s])),
    natures: new Map((raw.natures ?? []).map((n) => [n.id, n])),
    types: raw.types,
    conditions,
    items: new Map((raw.items ?? []).map((i) => [i.id, i])),
  };
}
