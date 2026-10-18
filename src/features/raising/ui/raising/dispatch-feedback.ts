import type { DispatchResult, GameController } from '../../../../kernel/contract.ts';
import type { MonsterView } from '../../../../shared/views.ts';

/** What every Raising tab gets: the monster, the controller, and the panel's one status line. */
export interface TabProps {m:MonsterView;c:GameController;feedback:string;say:(text:string)=>void}

/** A panel's status line after an action: `success` when it took effect, else the controller's reason. */
export const feedbackFor=(result:DispatchResult,success:string)=>result.ok?success:result.notice;
