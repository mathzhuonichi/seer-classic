import { useEffect, useRef } from 'react';
import { ARROW_STEPS } from '../world-walk.ts';
import { sceneCovered } from './scene-cover.ts';

export interface SceneKeys {
  /** Walks one arrow-key step. */
  step: (key: string) => void;
  /** Stops the walk and closes the world dialogue. */
  dismiss: () => void;
}

/** The global arrow-key walk ignores keys meant for what covers the scene and for form fields. */
const ignoresArrowKeys = (event: KeyboardEvent) => event.defaultPrevented || sceneCovered()
  || /^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement)?.tagName);

/**
 * The world scene's window keys outside battle, wherever focus is. The arrows walk, and Escape dismisses the dialogue; Escape is
 * captured before the shell closes a window, and skipped while something covers the scene, so one press closes one layer.
 */
export function useSceneKeys(battle: boolean, keys: SceneKeys) {
  const latest = useRef(keys);
  useEffect(() => { latest.current = keys; });
  useEffect(() => {
    if (battle) return;
    const arrow = (event: KeyboardEvent) => {
      if (ARROW_STEPS[event.key] && !ignoresArrowKeys(event)) { event.preventDefault(); latest.current.step(event.key); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !sceneCovered()) latest.current.dismiss(); };
    window.addEventListener('keydown', arrow); window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('keydown', arrow); window.removeEventListener('keydown', escape, true); };
  }, [battle]);
}
