export interface CatalogData {
  species: Record<string, unknown>[];
  skills: Record<string, unknown>[];
  natures: Record<string, unknown>[];
  items: Record<string, unknown>[];
  conditions: Record<string, unknown>[];
  bosses: Record<string, unknown>[];
  trainers?: Record<string, unknown>[];
  types: Record<string, unknown>;
}

/** Parsed `data/` files. Record directories are keyed by file path; each table is one file. */
export interface CatalogFiles {
  /** `data/monsters/NNNN.json`, one species per file. */
  monsters: Readonly<Record<string, unknown>>;
  /** `data/bosses/*.json`, one encounter per file. */
  bosses: Readonly<Record<string, unknown>>;
  /** `data/trainers/*.json`, one trainer team per file. */
  trainers: Readonly<Record<string, unknown>>;
  skills: unknown;
  natures: unknown;
  types: unknown;
  conditions: unknown;
  items: unknown;
}

const byPath = (records: Readonly<Record<string, unknown>>) => Object.keys(records).sort().map(key => records[key]);

/** The one catalog assembly, shared by the bundled loader below and the Node loader in `tools/catalog.mjs`. */
export function assembleCatalog(files: CatalogFiles): CatalogData {
  return {
    species: byPath(files.monsters), skills: files.skills, natures: files.natures, types: files.types,
    conditions: files.conditions, items: files.items, bosses: byPath(files.bosses), trainers: byPath(files.trainers),
  } as CatalogData;
}

/**
 * The catalog bundled into this build. Vite resolves the globs at build time; plain Node can import this
 * module for `assembleCatalog` but cannot call this function. Each call returns fresh arrays.
 */
export function bundledCatalog(): CatalogData {
  const tables = import.meta.glob('../../../data/{skills,natures,types,conditions,items}.json', { import: 'default', eager: true });
  // Keys are the glob paths as written; match the file name so the lookup does not depend on this module's depth.
  const table = (name: string) => Object.entries(tables).find(([key]) => key.endsWith(`/${name}.json`))?.[1];
  return assembleCatalog({
    monsters: import.meta.glob('../../../data/monsters/*.json', { import: 'default', eager: true }),
    bosses: import.meta.glob('../../../data/bosses/*.json', { import: 'default', eager: true }),
    trainers: import.meta.glob('../../../data/trainers/*.json', { import: 'default', eager: true }),
    skills: table('skills'), natures: table('natures'), types: table('types'), conditions: table('conditions'), items: table('items'),
  });
}

export async function loadCatalog(): Promise<CatalogData> {
  return bundledCatalog();
}
