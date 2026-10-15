import bundle from '../../data/gamedata.json';
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
/** The recovered bundle supplies the catalog; encounter files include later recovered bosses. */
export async function loadCatalog(): Promise<CatalogData> {
  const encounters = import.meta.glob('../../data/bosses/*.json', {import:'default',eager:true});
  const trainers = import.meta.glob('../../data/trainers/*.json', {import:'default',eager:true});
  return {...bundle, bosses:Object.values(encounters),trainers:Object.values(trainers)} as unknown as CatalogData;
}
