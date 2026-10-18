// Routes each player action to the feature that owns it and reports failures as notices.
import type { DispatchResult, GameAction } from './contract.ts';
import { battleInProgress, notice, type HandlerResult, type Runtime } from './api.ts';
import { FEATURES } from './features.ts';

type Handler = (rt: Runtime, action: GameAction) => HandlerResult;
const handlers = new Map<string, Handler>();
/** Actions that stay available while a battle is unresolved. */
const IN_BATTLE = new Set<string>();
for (const feature of FEATURES) {
  for (const [type, handler] of Object.entries(feature.actions)) {
    if (handlers.has(type)) throw new Error(`action ${type} is registered by two features`);
    handlers.set(type, handler as Handler);
  }
  feature.inBattle?.forEach(type => IN_BATTLE.add(type));
}

/** Engine rejections are shown in the player's terms. */
function failureText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (text.startsWith('illegal action')) return '当前指令不可用，请选择可用的技能、道具或精灵。';
  return text === 'battle has ended' ? '本场战斗已结束，请返回场景。' : text;
}

export function runAction(rt: Runtime, action: GameAction): DispatchResult {
  const before = rt.notices;
  let outcome: HandlerResult;
  try {
    const handler = handlers.get(action.type);
    if (!handler) throw new Error(`未知指令：${action.type}`);
    if (!IN_BATTLE.has(action.type) && battleInProgress(rt)) throw new Error('战斗结束后才能进行培养或编辑。');
    outcome = handler(rt, action);
  } catch (error) {
    notice(rt, failureText(error));
    return { ok: false, notice: rt.notices[0] };
  }
  return { ok: true, ...(rt.notices === before ? {} : { notice: rt.notices[0] }), ...(outcome ? { created: outcome.created } : {}) };
}
