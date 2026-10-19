// Boss fights with variants: the practice fight without one, the record of cleared variants, the honours for clearing every
// variant, and the result line that names whether the chosen variant's objectives were met.
import type { BattleResult, BossEncounter, EncounterVariant } from '../../../battle/core/src/index.ts';
import { allVariantHonors } from '../../domain/challenges/encounter-rows.ts';
import { offersPractice } from '../../domain/challenges/encounter-variants.ts';
import type { BattleSession, Runtime, SessionHooks } from '../../kernel/api.ts';

const ENCOUNTER_HOOKS: SessionHooks = {};
const PRACTICE_WIN = '练习战胜利：未选择挑战规则，不计入挑战记录，也不发放精元。';
/** A practice fight keeps no attempt or clear record and pays no reward items; its victory pays the coins and experience. */
const PRACTICE_HOOKS: SessionHooks = {
  unrecorded: true,
  settled: (_rt, session, result) => { if (result.success) session.resultMessage = PRACTICE_WIN; },
};

/** The hooks of a Boss, trainer or recruit fight with the chosen `variant`, or without one: a practice fight where it is offered. */
export function encounterHooks(encounter: BossEncounter, variant: EncounterVariant | null): SessionHooks {
  if (!variant) return offersPractice(encounter) ? PRACTICE_HOOKS : ENCOUNTER_HOOKS;
  return { settled: (rt, session, result) => settleVariant(rt, session, result, encounter, variant) };
}

/**
 * A win records the variant as cleared, and the first clear of the last one earns the honours for clearing every variant. The
 * result names whether its objectives were met: a win, a knockout that missed them (盖亚 knocked out before turn 10), or a
 * defeat; a retreat says only that it pays nothing.
 */
function settleVariant(rt: Runtime, session: BattleSession, result: BattleResult, encounter: BossEncounter, variant: EncounterVariant) {
  const rule = `规则「${variant.label.zh}」`;
  if (!result.success) {
    if (result.winner === 0) session.resultMessage = `对手已倒下，但未达成${rule}的目标，本次挑战未通过，请按规则要求重试。`;
    else if (result.reason !== 'flee') session.resultNotes.push(`本次未达成${rule}的目标。`);
    return;
  }
  const record = rt.save.game.bossVariants, cleared = record[encounter.id] ?? [], first = !cleared.includes(variant.id);
  if (first) record[encounter.id] = [...cleared, variant.id];
  const variants = encounter.variants!, completed = first && variants.every(entry => record[encounter.id].includes(entry.id));
  const honors = completed ? allVariantHonors(encounter.reward) : [];
  const earned = honors.length ? `${variants.length} 种规则全部通过，荣誉档案新增${honors.map(honor => `「${honor}」`).join('')}。` : '';
  session.resultMessage = `已达成${rule}的目标。${session.resultMessage}${earned}`;
}
