import { useEffect, useMemo, useReducer, useRef, useState, type RefObject, type SyntheticEvent } from 'react';
import { constrainScenePoint, getSceneLayout, type SceneLayout } from '../map-presentation.ts';
import { point, type ScenePoint } from '../scene-geometry.ts';
import { IDLE_WALK, approachStop, robotFoot, towerClimbed, towerStage, walkMotion, walkTiming, type RobotDirection } from '../world-walk.ts';
import { readWorldPreference, resolveWorldLocation, writeWorldPreference, type WorldPlanet, type WorldRegion } from '../../../domain/world/world.ts';
import { prefersReducedMotion } from '../../../shared/ui/reduced-motion.ts';

const DEFAULT_SCENE = { width: 1000, height: 580 };

/** The scene's displayed size: the background's aspect ratio fitted inside the viewport. */
export function useSceneFit(viewport: RefObject<HTMLElement | null>, background: string) {
  const [image, setImage] = useState({ source: '', ...DEFAULT_SCENE });
  const [size, setSize] = useState(DEFAULT_SCENE);
  const aspect = image.source === background ? image.width / image.height : DEFAULT_SCENE.width / DEFAULT_SCENE.height;
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const fit = () => {
      const width = Math.min(element.clientWidth, element.clientHeight * aspect);
      setSize({ width, height: width / aspect });
    };
    fit(); const observer = new ResizeObserver(fit); observer.observe(element);
    return () => observer.disconnect();
  }, [aspect]);
  const onLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const loaded = event.currentTarget;
    setImage({ source: background, width: loaded.naturalWidth, height: loaded.naturalHeight });
  };
  return { size, onLoad };
}

export interface ApproachOptions {
  /** Runs on arrival, or at once when the robot already stands there. */
  arrive: () => void;
  approaching?: string | null;
  /** The robot's foot point when it cannot be measured. */
  fallback: ScenePoint;
}

/** The explorer's scene and position (persisted as a UI preference) and the robot's timed walks between scene points. */
export function useWorldWalk() {
  const [preference, setPreference] = useState(readWorldPreference);
  const { planet, region } = resolveWorldLocation(preference.planetId, preference.regionId);
  const layout: SceneLayout = useMemo(() => getSceneLayout(planet, region), [planet, region]);
  const [motion, dispatch] = useReducer(walkMotion, IDLE_WALK);
  /** Counts landings, so that each arrival redraws the scene and its wildlife makes room for the explorer. */
  const [landings, setLandings] = useState(0);
  const player = useRef<HTMLDivElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const position = constrainScenePoint(layout, point(preference.x, preference.y));
  useEffect(() => writeWorldPreference(preference), [preference]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  /** Stop where the robot is; `patch` also changes the next transition time or facing. */
  function stop(patch: { duration?: number; direction?: RobotDirection } = {}) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dispatch({ type: 'stop', ...patch });
  }
  /** Walk to a scene point and run `after` on arrival; reduced motion arrives at once. */
  function walkTo(x: number, y: number, after?: () => void, approaching: string | null = null) {
    stop();
    const target = constrainScenePoint(layout, point(x, y));
    const element = player.current, scene = element?.closest('.world-scene')?.getBoundingClientRect();
    const current = element?.getBoundingClientRect();
    const from = current && scene && scene.width && scene.height ? robotFoot(current, scene) : point(preference.x, preference.y);
    const { direction, duration } = walkTiming(from, target, scene, prefersReducedMotion());
    dispatch({ type: 'start', duration, direction, approaching });
    setPreference(old => ({ ...old, x: target.x, y: target.y }));
    if (duration === 0) { after?.(); return; }
    timer.current = setTimeout(() => {
      timer.current = null;
      dispatch({ type: 'stop' });
      after?.();
    }, duration);
  }
  /** Walk up to a contact's feet, beside its name; a contact within a pixel opens at once. */
  function approach(button: HTMLElement, contact: ScenePoint, { arrive, approaching = null, fallback }: ApproachOptions) {
    const robot = player.current?.getBoundingClientRect();
    const scene = button.closest('.world-scene')!.getBoundingClientRect();
    const from = robot ? robotFoot(robot, scene) : fallback, name = button.querySelector('.world-character-name')?.getBoundingClientRect();
    const { stop: target, immediate } = approachStop(from, contact, scene, button.getBoundingClientRect().width, robot, name);
    if (!immediate) { walkTo(target.x, target.y, arrive, approaching); return; }
    // A nearby click opens immediately, and also stops an interrupted walk.
    stop({ duration: 0 });
    setPreference(old => ({ ...old, x: from.x, y: from.y }));
    arrive();
  }
  /** Land in a scene, the current one included, at `entry` or at its default entry. */
  function visit(planet: WorldPlanet, region: WorldRegion, entry?: ScenePoint) {
    stop({ duration: 0, direction: 'front' });
    const destination = getSceneLayout(planet, region), landing = constrainScenePoint(destination, entry ?? destination.entry);
    setPreference(old => ({ ...old, planetId: planet.id, regionId: region.id, ...landing, visited: [...new Set([...old.visited, `${planet.id}/${region.id}`])] }));
    setLandings(count => count + 1);
  }
  return { planet, region, layout, position, motion, player, landings, stop, walkTo, approach, visit };
}

/**
 * Inside the Brave Tower, a new floor or completion re-lands the explorer (`land`), clear of the next guardian and its floor badge;
 * entering the tower keeps the landing it came by (`enter`).
 */
export function useTowerLanding(tower: { floor: number; complete: boolean } | undefined, land: () => void, enter: () => void) {
  const stage = towerStage(tower), shown = useRef(stage);
  useEffect(() => {
    const climbed = towerClimbed(shown.current, stage); shown.current = stage;
    if (climbed) land(); else if (stage) enter();
  }, [stage]);
}
