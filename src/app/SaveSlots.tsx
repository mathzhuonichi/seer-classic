import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SaveLibrary } from '../kernel/save-library.ts';
import type { SlotRecord } from '../kernel/save-slots.ts';
import { useGame } from '../shared/ui/use-game.ts';
import './save-slots.css';

export interface SaveSlotsProps {
  saves: SaveLibrary;
  onExport: () => void; onImport: () => void;
  /** Downloads a slot's stored text under `fileName`. */
  onExportFile: (text: string, fileName: string) => void;
  onMessage: (message: string) => void;
}

/** What the open prompt asks: to start a new save, or to delete a slot. */
type Prompt = { kind: 'new' } | { kind: 'delete'; slot: SlotRecord } | null;

const SAVED_AT: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
const savedAt = (slot: SlotRecord) => slot.savedAt ? new Date(slot.savedAt).toLocaleString('zh-CN', SAVED_AT) : '尚未保存';
const failure = (error: unknown) => error instanceof Error ? error.message : String(error);

/** 航行存档: the save slots, a new save, loading and deleting a slot, and the save files. */
export function SaveSlots({ saves, onExport, onImport, onExportFile, onMessage }: SaveSlotsProps) {
  const slots = useSyncExternalStore(saves.subscribe, saves.slots), { game, slotId } = saves.current();
  const battleOpen = useGame(game, snapshot => !!snapshot.battle), [prompt, setPrompt] = useState<Prompt>(null), [busy, setBusy] = useState(false);
  // Where focus goes once a prompt closes, so that it does not fall to the page body.
  const section = useRef<HTMLElement>(null), refocus = useRef<string | null>(null);
  useEffect(() => {
    if (prompt || !refocus.current) return;
    section.current?.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  }, [prompt]);
  const close = (focus: string) => { refocus.current = focus; setPrompt(null); };
  // A new save, a load or an import replaces this window's game, so only failures are told here; the new game says what it opened.
  async function run(task: () => Promise<void>, failed: string) {
    setBusy(true);
    try { await task(); } catch (error) { onMessage(`${failed}${failure(error)}`); } finally { setBusy(false); }
  }
  const remove = (slot: SlotRecord) => run(async () => { await saves.remove(slot.id); onMessage(`已删除「${slot.name}」。`); }, '删除失败：');
  const exportSlot = (slot: SlotRecord) =>
    run(async () => onExportFile(await saves.exportSlot(slot.id), `赛尔号-无法读取的存档-${slot.name}.json`), '导出失败：');
  const active = slots.find(slot => slot.id === slotId), switching = battleOpen || busy;
  return <section ref={section} className="save-slots" aria-label="航行存档">
    <h3>航行存档</h3>
    <p>旅程自动保存到当前存档。导出的文件可保留或转移进度；导入的文件另存为新存档。</p>
    {prompt?.kind === 'new' ? <div className="save-slot-prompt" role="group" aria-label="确认新存档">
      <span>开始新的旅程？{active ? `当前存档「${active.name}」保持不变。` : ''}</span>
      <button className="save-slot-confirm" onClick={() => { close('.save-slot-new'); void run(saves.newSave, '新存档未能创建：'); }}>
        开始新存档</button>
      <button autoFocus onClick={() => close('.save-slot-new')}>取消</button>
    </div> : <div className="action-row">
      <button className="save-slot-new" disabled={switching} onClick={() => setPrompt({ kind: 'new' })}>新存档</button>
      <button onClick={onExport}>导出存档</button><button disabled={switching} onClick={onImport}>导入存档</button>
    </div>}
    {battleOpen && <p className="small muted">战斗中不能新建、读取或导入存档。</p>}
    <ul className="save-slot-list">{slots.map(slot => <SlotRow key={slot.id} slot={slot} active={slot.id === slotId} disabled={switching}
      deleting={prompt?.kind === 'delete' && prompt.slot.id === slot.id}
      onLoad={() => void run(() => saves.load(slot.id), '读取失败：')} onExport={() => void exportSlot(slot)}
      onDelete={() => setPrompt({ kind: 'delete', slot })} onCancel={() => close(`[data-slot="${slot.id}"] .save-slot-delete`)}
      onConfirm={() => { close('.save-slot-new'); void remove(slot); }}/>)}</ul>
  </section>;
}

interface SlotRowProps {
  slot: SlotRecord; active: boolean; disabled: boolean; deleting: boolean;
  onLoad: () => void; onExport: () => void; onDelete: () => void; onCancel: () => void; onConfirm: () => void;
}

/** One slot: its name, when it was saved and what it holds, or why it cannot be read; then what can be done with it. */
function SlotRow({ slot, active, disabled, deleting, onLoad, onExport, onDelete, onCancel, onConfirm }: SlotRowProps) {
  const { summary, unreadable } = slot;
  return <li data-slot={slot.id} className={`save-slot${active ? ' is-active' : ''}${unreadable ? ' is-unreadable' : ''}`} aria-current={active || undefined}>
    <div className="save-slot-heading"><strong>{slot.name}</strong>{active && <span className="save-slot-badge">当前</span>}
      <span className="save-slot-time">{savedAt(slot)}</span></div>
    <p className="save-slot-summary">{unreadable ? `无法读取：${unreadable}`
      : summary ? `精灵 ${summary.monsters} · 最高 Lv${summary.topLevel} · 图鉴 ${summary.owned} · 已通关 ${summary.cleared}` : '—'}</p>
    {deleting ? <div className="save-slot-prompt" role="group" aria-label={`确认删除${slot.name}`}>
      <span>删除「{slot.name}」？删除后无法恢复{unreadable ? '，可先导出备份' : ''}。</span>
      <button className="save-slot-confirm" onClick={onConfirm}>确认删除</button><button autoFocus onClick={onCancel}>取消</button>
    </div> : !active && <div className="save-slot-actions">
      <button className="save-slot-load" disabled={disabled} onClick={onLoad}>{unreadable ? '重试读取' : '读取'}</button>
      {unreadable && <button onClick={onExport}>导出</button>}
      <button className="save-slot-delete" onClick={onDelete}>删除</button>
    </div>}
  </li>;
}
