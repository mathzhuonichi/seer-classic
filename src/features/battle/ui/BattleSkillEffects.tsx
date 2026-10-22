import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { BattleMonsterView } from '../../../shared/views.ts';
import { getLayoutZoom } from '../../../shared/game-display.ts';
import { createSkillEffectStage, type SkillEffectStage } from '../battle-skill-effects.ts';
import type { SkillEffectCue } from '../battle-player.ts';
import { REDUCED_MOTION_MS } from '../battle-playback.ts';
import { skillEffectPlacement, type Box } from '../skill-effect-placement.ts';
import './battle-skill-effects.css';

/**
 * The arena and the two creature boxes (left, then right) in the layer's px. The layer has an effective CSS zoom of 1, so that
 * Ruffle draws at the screen's pixel density and its stage px are screen px; the boxes are layout boxes (offsets, the same in
 * every engine, where getBoundingClientRect under a CSS zoom is not) scaled by the game display's zoom, which changes on resize.
 */
function arenaGeometry(layer: HTMLElement) {
  const parent = layer.parentElement, arena = layer.closest<HTMLElement>('.classic-arena');
  if (!parent || !arena) return null;
  const zoom = getLayoutZoom(parent);
  const box = (left: number, top: number, width: number, height: number): Box =>
    ({ left: left * zoom, top: top * zoom, width: width * zoom, height: height * zoom });
  const creature = (side: number) => {
    const element = parent.querySelector<HTMLElement>(`:scope > .classic-combatant.side-${side}`);
    return element && box(element.offsetLeft, element.offsetTop, element.offsetWidth, element.offsetHeight);
  };
  const left = creature(0), right = creature(1);
  return { zoom, arena: box(-parent.offsetLeft, -parent.offsetTop, arena.clientWidth, arena.clientHeight),
    creatures: left && right ? [left, right] as const : null };
}

/** Keeps the layer over the arena, which clips it; the arena is found from the layer (an enclosing ref attaches only later). */
function useArenaCover(layer: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const element = layer.current, arena = element?.closest('.classic-arena');
    if (!element || !arena) return;
    const cover = () => {
      const geometry = arenaGeometry(element);
      if (!geometry) return;
      const { zoom, arena: box } = geometry;
      Object.assign(element.style, { zoom: String(1 / zoom), left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    };
    cover();
    const observer = new ResizeObserver(cover);
    observer.observe(arena);
    window.addEventListener('resize', cover);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', cover);
    };
  }, [layer]);
}

/**
 * The arena's original skill effects: one host stage per battle screen, drawn over both creatures and under the numbers and
 * the HUD, clipped by the arena. A move's effect starts at its cue's delay (the attacker's hit marker), anchored at the acting
 * creature, and stops when the cue ends; under reduced motion it holds its middle frame. The creatures on screen have their
 * moves' effects loaded.
 */
export default function BattleSkillEffects({ cue, player, enemy }: { cue: SkillEffectCue | null; player: BattleMonsterView; enemy: BattleMonsterView }) {
  const layer = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<SkillEffectStage | null>(null);
  useArenaCover(layer);
  useEffect(() => {
    const created = createSkillEffectStage(layer.current!);
    setStage(created);
    return () => created.dispose();
  }, []);
  const moves = [...player.skills, ...enemy.skills].map(skill => skill.id).join();
  useEffect(() => stage?.prepare(moves.split(',').filter(Boolean).map(Number)), [stage, moves]);
  useEffect(() => {
    const skillId = cue?.move.skillId, element = layer.current;
    if (!stage || !cue || skillId === undefined || !element) return;
    stage.prepare([skillId]);
    let stop = () => {};
    const timer = setTimeout(() => {
      const geometry = arenaGeometry(element), at = geometry?.creatures && skillEffectPlacement(geometry.arena, geometry.creatures, cue.move.side);
      if (at) stop = stage.play(skillId, at, cue.duration <= REDUCED_MOTION_MS);
    }, cue.delay);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [stage, cue]);
  return <div ref={layer} className="battle-skill-effects" aria-hidden="true" inert />;
}
