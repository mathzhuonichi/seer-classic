import type { ReactNode } from 'react';
import type { BattleMonsterView } from '../../../shared/views.ts';
import { STATUS_LABELS, type StageKey } from '../../../shared/labels.ts';
import { conditionSummary, stageChips } from '../battle-hud.ts';
import './battle-condition-icons.css';

/** A badge's colour and its white glyph on a 16 × 16 grid, filled or (`line`) stroked. Drawn here: the art pack has no buff icons. */
interface Glyph { color: string; d: string; line?: boolean }

const FLAME = 'M8 1.8c.4 2.4 3.6 3.6 3.6 7.1a3.6 3.6 0 0 1-7.2.1c0-1.6.9-2.6 1.6-3.3.1 1.2.7 1.9 1.4 2.1C7 6 7.2 3.9 8 1.8z';
const STATUS_GLYPHS: Record<string, Glyph> = {
  paralysis: { color: '#e2a91b', d: 'M9.5 1.5 3.8 9h3.6l-1.3 5.5L12.2 7H8.6z' },
  poison: { color: '#8a43c4', d: 'M8 2.2C6 5.3 4.4 7.4 4.4 9.6a3.6 3.6 0 0 0 7.2 0C11.6 7.4 10 5.3 8 2.2z' },
  burn: { color: '#e0482a', d: FLAME },
  freeze: { color: '#3aa7e4', d: 'M8 2v12M2.8 5l10.4 6M2.8 11l10.4-6', line: true },
  sleep: { color: '#5664cf', d: 'M10.6 2.4a5.6 5.6 0 1 0 3 9.8A6 6 0 0 1 10.6 2.4z' },
  fear: { color: '#76649a', d: 'M6.9 2.8h2.2l-.4 6.9H7.3zM8 11a1.3 1.3 0 1 1 0 2.6A1.3 1.3 0 0 1 8 11z' },
  fatigue: { color: '#9a7446', d: 'M10.8 2.6C9.2 5 8.2 6.5 8.2 7.9a2.6 2.6 0 0 0 5.2 0c0-1.4-1-2.9-2.6-5.3zM2.6 11.4h6.6v1.7H2.6z' },
  petrify: { color: '#7f868e', d: 'M5 3.4h5.6L13.6 7l-1.5 5.6H4L2.4 7.6z' },
  confusion: { color: '#cf57a9', d: 'M8.6 8a.9.9 0 1 1-1.4-.8 2.3 2.3 0 1 1 3.4 2.4 3.8 3.8 0 1 1-1-6.8', line: true },
  weaken: { color: '#a13d3d', d: 'M8 13.6 2.7 8.4A3.1 3.1 0 0 1 8 4.7a3.1 3.1 0 0 1 5.3 3.7z' },
  leech: { color: '#3f9c45', d: 'M7.3 8h1.4v6H7.3zM8 9C5 9 3 7 3 4c2.6 0 5 1.6 5 5zm0-.5C8 5.5 10 4 13 4c0 2.6-2 4.5-5 4.5z' },
  flammable: { color: '#ee8a1e', d: FLAME, line: true },
  frozen_solid: { color: '#1f8fb4', d: 'M8 2l5 3v6l-5 3-5-3V5zM8 2v12', line: true },
};
const STAGE_GLYPHS: Record<StageKey, Glyph> = {
  atk: { color: '#d9512e', d: 'M13 3 5.6 10.4M4 9l3 3M2.8 13.2l2-2', line: true },
  def: { color: '#2d86cf', d: 'M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z' },
  spa: { color: '#a54cc9', d: 'M8 1.5l1.6 4.9L14.5 8l-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z' },
  spd: { color: '#26a58c', d: 'M8 2.5l4.5 1.8v3.5c0 2.7-2 4.5-4.5 5.4-2.5-.9-4.5-2.7-4.5-5.4V4.3zM8 6v4M6 8h4', line: true },
  spe: { color: '#d99a17', d: 'M3.5 4l4 4-4 4M8.5 4l4 4-4 4', line: true },
  acc: { color: '#c0507f', d: 'M8 1.8v3.4M8 10.8v3.4M1.8 8h3.4M10.8 8h3.4M8 5.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6z', line: true },
  eva: { color: '#52913a', d: 'M2.5 6h7a2 2 0 1 0-2-2M2.5 10h9a2 2 0 1 1-2 2', line: true },
};
/** A status's badge by the label the view names it with (`statuses` holds labels; fear and flinch share 害怕). */
const STATUS_BY_LABEL = new Map(Object.entries(STATUS_GLYPHS).map(([id, glyph]) => [STATUS_LABELS[id], glyph]));

const LINE = { fill: 'none', stroke: '#fff', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** `corner`: a stage's level, for which the glyph shrinks towards the top left. */
function Badge({ glyph, title, corner }: { glyph?: Glyph; title: string; corner?: ReactNode }) {
  return <svg className="battle-condition-icon" viewBox="0 0 16 16" aria-hidden="true">
    <title>{title}</title>
    <rect width="16" height="16" rx="3.5" fill={glyph?.color ?? '#5d6f80'}/>
    {glyph && <path d={glyph.d} transform={corner ? 'translate(.4 .4) scale(.8)' : undefined} {...glyph.line ? LINE : { fill: '#fff' }}/>}
    {corner ?? (!glyph && <text x="8" y="12" textAnchor="middle">{title[0]}</text>)}
  </svg>;
}

/** The statuses and stat stages under a health bar as badges; each names itself on hover, and the row is read as one summary. */
export default function BattleConditionIcons({ monster }: { monster: BattleMonsterView }) {
  const summary = conditionSummary(monster);
  return <div className="classic-conditions" title={summary} aria-label={summary}>
    {monster.statuses.map(status => <Badge key={status} glyph={STATUS_BY_LABEL.get(status)} title={status}/>)}
    {stageChips(monster.stages).map(chip => <Badge key={chip.stat} glyph={STAGE_GLYPHS[chip.stat as StageKey]}
      title={`${chip.label}${chip.value > 0 ? '提升' : '下降'} ${Math.abs(chip.value)} 级`}
      corner={<text className={chip.value > 0 ? 'is-up' : 'is-down'} x="15.5" y="15.5" textAnchor="end">
        {chip.value > 0 ? '+' : '−'}{Math.abs(chip.value)}</text>}/>)}
  </div>;
}
