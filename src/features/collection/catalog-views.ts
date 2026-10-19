import type { BossView, SpeciesView } from '../../shared/views.ts';

type SpeciesRow = Omit<SpeciesView,'owned'>;
type BossRow = Omit<BossView,'cleared'|'attempts'>;

/**
 * Catalog rows for the snapshot that keep their identity until their collection or challenge
 * progress actually changes, so memoised views downstream only recompute on real changes.
 */
export function createCatalogViews(
  species: SpeciesRow[], bosses: BossRow[],
  decorateBoss: (view: BossView, attempts: number, wins: number, variantsCleared: readonly string[]) => BossView,
) {
  const variants = species.map(row => ({id: row.id, owned: {...row, owned: true}, unowned: {...row, owned: false}}));
  let collection: SpeciesView[] = variants.map(row => row.unowned);
  let ledger: readonly number[] | undefined, ledgerLength = -1, ownedIds = new Set<number>();
  let challenges: BossView[] = [];
  /** The wins each boss row was decorated at: they can set its level (洛拉斯克), but the row does not show them. */
  let decoratedWins: number[] = [];
  return {
    species(ids: readonly number[]): SpeciesView[] {
      // The saved collection ledger appends in place; imports and resets replace its array.
      if (ids === ledger && ids.length === ledgerLength) return collection;
      ledger = ids; ledgerLength = ids.length;
      const next = new Set(ids);
      if (next.size === ownedIds.size && [...next].every(id => ownedIds.has(id))) return collection;
      ownedIds = next;
      collection = variants.map(row => next.has(row.id) ? row.owned : row.unowned);
      return collection;
    },
    /** `wins`: the recorded wins per encounter; `variants`: the cleared variant ids per encounter. */
    bosses(
      cleared: readonly string[], attempts: Record<string, number>, wins: Record<string, number>,
      variants: Readonly<Record<string, readonly string[]>>,
    ): BossView[] {
      const done = new Set(cleared), variantsCleared = (id: string) => variants[id] ?? [], winsOf = (id: string) => wins[id] ?? 0;
      const current = (view: BossView, index: number) => view.cleared === done.has(view.id) && view.attempts === (attempts[view.id] ?? 0)
        && decoratedWins[index] === winsOf(view.id)
        && (view.variants ?? []).every(variant => variant.cleared === variantsCleared(view.id).includes(variant.id));
      if (challenges.length === bosses.length && challenges.every(current)) return challenges;
      challenges = bosses.map((row, index) => {
        const existing = challenges[index];
        if (existing && current(existing, index)) return existing;
        const count = attempts[row.id] ?? 0;
        return decorateBoss({...row, cleared: done.has(row.id), attempts: count}, count, winsOf(row.id), variantsCleared(row.id));
      });
      decoratedWins = bosses.map(row => winsOf(row.id));
      return challenges;
    },
  };
}
