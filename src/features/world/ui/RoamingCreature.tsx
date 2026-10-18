import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import type { SpeciesView } from '../../../shared/views.ts';
import { creatureSceneHome, type SceneLayout } from '../map-presentation.ts';
import { percentIn, type SceneBounds, type ScenePoint } from '../scene-geometry.ts';
import { MAX_ROAM_FRAME_MS, advanceRoam, explorerKeepOut, roamFit, roamTerritory, startRoam, type RoamState } from '../world-roaming.ts';
import { contactFoot } from '../world-walk.ts';
import { CreatureArt } from '../../../shared/ui/CreatureArt.tsx';
import { sceneCovered } from './scene-cover.ts';

/** A screen rectangle as scene percentages. */
function sceneBounds(scene: DOMRect, rect: DOMRect): SceneBounds {
  const start = percentIn(scene, rect.left, rect.top), end = percentIn(scene, rect.right, rect.bottom);
  return { left: start.x, top: start.y, right: end.x, bottom: end.y };
}
const union = (a: SceneBounds, b: SceneBounds): SceneBounds =>
  ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
/** Where a creature appearing now may not start: where its host or name would cover the explorer, measured as rendered. */
function arrivalKeepOut(sceneElement: HTMLElement, host: HTMLElement): SceneBounds | undefined {
  const explorer = sceneElement.querySelector('.world-player'), name = host.querySelector('.world-character-name');
  if (!explorer || !name) return undefined;
  const scene = sceneElement.getBoundingClientRect(), art = host.getBoundingClientRect();
  const body = union(sceneBounds(scene, art), sceneBounds(scene, name.getBoundingClientRect()));
  return explorerKeepOut(sceneBounds(scene, explorer.getBoundingClientRect()), body, percentIn(scene, art.left + art.width / 2, art.bottom));
}

/** Animates one creature host with requestAnimationFrame; inline styles, not React state, carry its position.
 * The frame loop restarts when `identity`, `battle` or the layout changes; the roaming state persists. */
function useRoaming(button: { current: HTMLButtonElement | null }, layout: SceneLayout, home: ScenePoint, frozen: boolean, battle: boolean, identity: string) {
  const freeze = useRef(frozen), state = useRef<RoamState | null>(null);
  freeze.current = frozen;
  useEffect(() => {
    let frame = 0, last = 0;
    const territory = roamTerritory(layout, home);
    const resetClock = () => { last = 0; };
    document.addEventListener('visibilitychange', resetClock);
    const tick = (now: number) => {
      const element = button.current;
      if (!element) return;
      const sceneElement = element.closest<HTMLElement>('.world-scene')!;
      const scene = { width: sceneElement.clientWidth, height: sceneElement.clientHeight };
      const visible = !!element.getClientRects().length && scene.width > 0 && scene.height > 0;
      const paused = freeze.current || battle || document.hidden || !visible || sceneCovered();
      const delta = last ? Math.min(MAX_ROAM_FRAME_MS, now - last) : 0; last = now;
      if (visible) {
        // Fit with layout sizes: rendered rectangles would mix in the CSS zoom.
        const labelHeight = element.querySelector<HTMLElement>('.world-character-name')?.offsetHeight ?? 0;
        const { scale, bounds } = roamFit({ scene, body: { width: element.offsetWidth, height: element.offsetHeight }, labelHeight });
        element.style.setProperty('--roam-size', String(scale));
        const context = { layout, home, territory, bounds, scene, random: Math.random };
        const roam = state.current = advanceRoam(state.current ?? startRoam(context, arrivalKeepOut(sceneElement, element)), context, delta, paused);
        if (roam.leg) element.dataset.path = roam.leg.control ? 'curved' : 'straight';
        element.style.left = `${roam.position.x}%`; element.style.top = `${roam.position.y}%`;
        element.dataset.direction = roam.facing;
      }
      element.dataset.motion = paused ? 'paused' : state.current?.leg ? 'walking' : 'idle';
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', resetClock); };
  }, [identity, battle, layout]);
  return freeze;
}

export function RoamingCreature({ species, instanceId, level, index, count, layout, frozen, battle, onApproach }: {
  species: SpeciesView; instanceId: string; level: number; index: number; count: number; layout: SceneLayout; frozen: boolean; battle: boolean;
  onApproach: (event: MouseEvent<HTMLButtonElement>, foot: ScenePoint) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const home = creatureSceneHome(layout, index, count);
  const freeze = useRoaming(button, layout, home, frozen, battle, `${index}/${count}/${instanceId}`);
  function approach(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation(); freeze.current = true;
    event.currentTarget.dataset.motion = 'paused';
    const scene = event.currentTarget.closest('.world-scene')!.getBoundingClientRect();
    onApproach(event, contactFoot(event.currentTarget.getBoundingClientRect(), scene));
  }
  const style = { left: `${home.x}%`, top: `${home.y}%`, '--scene-creature-size': layout.creatureSize ?? 9 } as CSSProperties;
  return <button ref={button} className="world-creature world-roamer" style={style} data-species={species.id} data-instance={instanceId} data-level={level}
    data-direction="right" data-motion="idle" aria-label={`与${species.name}互动`} onClick={approach}>
    <span className="world-creature-shadow"/><span className="world-roaming-footsteps" aria-hidden="true"><i/><i/></span>
    <div className="world-sprite-art"><div className="world-roaming-turn"><div className="world-roaming-step">
      <CreatureArt species={species.id} name={species.name}/>
    </div></div></div>
    <span className="world-character-name">{species.name}<small>Lv.{level}</small></span>
  </button>;
}
