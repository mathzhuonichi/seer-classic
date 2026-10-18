import { useEffect, useRef, type CSSProperties, type MouseEvent } from 'react';
import type { SpeciesView } from '../../game-types.ts';
import { creatureSceneHome, type SceneLayout } from '../../presentation/map-presentation.ts';
import type { ScenePoint } from '../../presentation/scene-geometry.ts';
import { MAX_ROAM_FRAME_MS, advanceRoam, roamFit, roamTerritory, startRoam, type RoamState } from '../../presentation/world-roaming.ts';
import { contactFoot } from '../../presentation/world-walk.ts';
import { CreatureArt } from '../CreatureArt.tsx';

/** Overlays that pause wildlife while they cover the scene. */
const COVERING_OVERLAYS = '.scene-window,.scene-window-shield,.modal-backdrop,.battle-loading';

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
      const paused = freeze.current || battle || document.hidden || !visible || !!document.querySelector(COVERING_OVERLAYS);
      const delta = last ? Math.min(MAX_ROAM_FRAME_MS, now - last) : 0; last = now;
      if (visible) {
        // Fit with layout sizes: rendered rectangles would mix in the CSS zoom.
        const labelHeight = element.querySelector<HTMLElement>('.world-character-name')?.offsetHeight ?? 0;
        const { scale, bounds } = roamFit({ scene, body: { width: element.offsetWidth, height: element.offsetHeight }, labelHeight });
        element.style.setProperty('--roam-size', String(scale));
        const context = { layout, home, territory, bounds, scene, random: Math.random };
        const roam = state.current = advanceRoam(state.current ?? startRoam(context), context, delta, paused);
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
    onApproach(event, contactFoot(event.currentTarget.getBoundingClientRect(), event.currentTarget.closest('.world-scene')!.getBoundingClientRect()));
  }
  return <button ref={button} className="world-creature world-roamer" style={{left:`${home.x}%`,top:`${home.y}%`,'--scene-creature-size':layout.creatureSize??9} as CSSProperties}
    data-species={species.id} data-instance={instanceId} data-level={level} data-direction="right" data-motion="idle" aria-label={`与${species.name}互动`} onClick={approach}>
    <span className="world-creature-shadow"/><span className="world-roaming-footsteps" aria-hidden="true"><i/><i/></span>
    <div className="world-sprite-art"><div className="world-roaming-turn"><div className="world-roaming-step"><CreatureArt species={species.id} name={species.name}/></div></div></div>
    <span className="world-character-name">{species.name}<small>Lv.{level}</small></span>
  </button>;
}
