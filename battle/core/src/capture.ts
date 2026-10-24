import * as C from './constants.ts';

/**
 * Remake calibration, NOT a recovered Seer server formula. Official clients send
 * the capsule ID to command 2409 and receive catchTime; they do not roll locally.
 * Keep the original equation and short-circuit draws stable until server evidence
 * supports a replacement. See design/notes/capture-official-v25.md.
 */
export function rollReconstructedCapture(
  input: { maxHp: number; hp: number; catchRate: number; multiplier: number | null; controlStatus: boolean; anyStatus: boolean },
  next: () => number,
): boolean {
  if (input.multiplier === null) return true;
  const bonus = input.controlStatus ? C.CAPTURE_CONTROL_BONUS : input.anyStatus ? C.CAPTURE_DOT_BONUS : 1;
  const a = ((3 * input.maxHp - 2 * input.hp) * input.catchRate * input.multiplier / (3 * input.maxHp)) * bonus;
  return a >= C.CAPTURE_CERTAIN || next() * C.CAPTURE_CERTAIN < a;
}
