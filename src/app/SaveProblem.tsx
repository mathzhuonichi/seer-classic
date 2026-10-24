import { useSyncExternalStore } from 'react';
import { saveWriteProblem, subscribeSaveWriteProblem } from '../kernel/persistence.ts';

/** Shown while the latest save write failed: progress is only in memory until a write succeeds, so export it now. */
export function SaveProblem({ onExport }: { onExport: () => void }) {
  const problem = useSyncExternalStore(subscribeSaveWriteProblem, saveWriteProblem);
  if (!problem) return null;
  return <div className="save-problem" role="alert">
    <p>存档未能写入（{problem}）。在下次成功写入前，进度只保存在本次运行中，请立即导出存档。</p>
    <button className="primary" onClick={onExport}>导出存档</button>
  </div>;
}
