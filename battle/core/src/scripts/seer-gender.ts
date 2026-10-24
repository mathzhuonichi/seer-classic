// Seer side-effect templates that hinge on 性别 (雌性/雄性). Gender does not exist in our data, so their branches never
// match and each template is a no-op. Template text is quoted above each entry. How scripts work: SCRIPTS.md.
import type { ScriptEntry, ScriptRegistry } from '../types.ts';

const NOOP: ScriptEntry = { apply() {} };

export const GENDER_SCRIPTS: ScriptRegistry = {
  // 目标为雄性，伤害为200%；目标为雌性，伤害为50%
  seer_eff_82: NOOP,
  // 自身雄性，下两回合必定先手；自身雌性，下两回合必定致命一击
  seer_eff_83: NOOP,
  // {0}回合内对雄性精灵的伤害为{1}倍
  seer_eff_98: NOOP,
  // 对方为{0}则附加{1}点伤害
  seer_eff_130: NOOP,
  // 对方为{0}则免疫当前回合伤害
  seer_eff_131: NOOP,
};
