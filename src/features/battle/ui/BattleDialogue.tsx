import { useId } from 'react';
import type { BattleView } from '../../../kernel/contract.ts';
import { recentBattleLog } from '../battle-hud.ts';

/** The current line, the latest turn's entries, and the expandable full record. */
export default function BattleDialogue({ battle, dialogue, busy, showLog, onToggleLog }: {
  battle: BattleView; dialogue: string; busy: boolean; showLog: boolean; onToggleLog: () => void;
}) {
  const recordId = useId();
  const showRecent = !showLog && !busy && battle.turn > 0 && !battle.finished;
  return <section className={`classic-dialogue${showLog ? ' is-expanded' : ''}`} aria-label="战斗信息">
    <div className="classic-dialogue-header">
      <strong className="classic-record-title">对战信息</strong>
      <span className={`classic-dialogue-signal ${busy ? 'playing' : ''}`} aria-hidden="true" />
      <div className="classic-dialogue-lines">
        <p aria-live="polite" aria-atomic="true">{dialogue}</p>
        {showRecent && <div className="classic-recent-log" role="log" aria-label="最近行动记录">
          {recentBattleLog(battle.log).map((line, index) => <p key={index}>{line}</p>)}
        </div>}
      </div>
      <button className={`classic-log-toggle${showLog ? ' is-collapse' : ''}`} disabled={busy && !showLog} aria-label={showLog ? '收起战斗记录' : undefined}
        aria-expanded={showLog} aria-controls={recordId} onClick={onToggleLog}>{showLog ? '×' : '战斗记录'}</button>
    </div>
    {showLog && <div id={recordId} className="classic-battle-history" role="log" aria-label="完整战斗记录" tabIndex={0}>
      {battle.log.map((line, index) => <p key={index}>{line}</p>)}
    </div>}
  </section>;
}
