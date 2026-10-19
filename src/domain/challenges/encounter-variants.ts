// Encounter variants: the source's weekday objectives and fields, which the player picks before a Boss fight
// (no real-time clock), and the practice fight some encounters offer without one.
import type { BossEncounter, EncounterVariant } from '../../../battle/core/src/index.ts';

/**
 * Whether a fight without a variant is offered as practice: no attempt, clear record or reward items (盖亚's free practice fight).
 * Without it, every fight of an encounter with variants takes one, as every source day or time window had its rules.
 */
export const offersPractice = (encounter: BossEncounter) => !!encounter.variants?.length && encounter.practice_fight === true;

/** The variant chosen for `encounter`, or null for a fight without one; throws the reason when the choice does not fit it. */
export function chosenVariant(encounter: BossEncounter, id: string | undefined): EncounterVariant | null {
  const variants = encounter.variants ?? [], name = encounter.name?.zh ?? encounter.id;
  if (id === undefined) {
    if (variants.length && !offersPractice(encounter)) throw new Error(`请先选择${name}的挑战规则。`);
    return null;
  }
  const variant = variants.find(entry => entry.id === id);
  if (!variant) throw new Error(variants.length ? `${name}没有这项挑战规则，请重新选择。` : `${name}没有可选的挑战规则。`);
  return variant;
}
