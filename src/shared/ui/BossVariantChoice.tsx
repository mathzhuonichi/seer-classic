import { useId } from 'react';
import type { EncounterVariantView } from '../views.ts';
import './boss-variant-choice.css';

/** The variant a choice starts on: the first one not yet cleared, else the first. */
export const defaultVariant = (variants: readonly EncounterVariantView[]) => (variants.find(variant => !variant.cleared) ?? variants[0]).id;

export interface BossVariantChoiceProps {
  variants: readonly EncounterVariantView[];
  /** Offers the practice fight, which is picked as null. */
  practice?: boolean;
  selected: string | null;
  onSelect: (variant: string | null) => void;
  /** Shows every variant's rules and objectives, not only the picked one's. */
  expanded?: boolean;
}

const PRACTICE_NOTE = '不选择规则：胜利只获得赛尔豆与积累经验，不计入挑战记录，也不发放精元。';

/** The choice of a Boss's variant before the start: each variant's name, the rules it adds, its objectives, and whether it was cleared. */
export default function BossVariantChoice({ variants, practice, selected, onSelect, expanded }: BossVariantChoiceProps) {
  const name = useId(), cleared = variants.filter(variant => variant.cleared).length;
  const shown = (id: string | null) => expanded || selected === id;
  return <fieldset className="boss-variant-choice">
    <legend>挑战规则 · 已通过 {cleared}/{variants.length}</legend>
    {practice && <label className="boss-variant-option">
      <input type="radio" name={name} checked={selected === null} onChange={() => onSelect(null)}/>
      <span><strong>练习战</strong>{shown(null) && <small>{PRACTICE_NOTE}</small>}</span>
    </label>}
    {variants.map(variant => <label key={variant.id} className="boss-variant-option">
      <input type="radio" name={name} checked={selected === variant.id} onChange={() => onSelect(variant.id)}/>
      <span>
        <strong>{variant.label}{variant.cleared && <em>✓ 已通过</em>}</strong>
        {shown(variant.id) && <>
          {!!variant.rules.length && <small>规则：{variant.rules.join('；')}。</small>}
          <small>胜利条件：{variant.win}。</small>
          <small>失败条件：{variant.lose}。</small>
        </>}
      </span>
    </label>)}
  </fieldset>;
}
