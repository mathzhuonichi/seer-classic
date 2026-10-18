// The browser's idle slots for the controller's idle work (turn preparation). The battle screen holds them while a turn plays,
// so a preparation that takes tens of milliseconds runs after the playback instead of in its first frames.

let holds = 0;
const held: (() => void)[] = [];

/**
 * Runs `task` in an idle slot after the frame. WebKit, the macOS app's web view, has no requestIdleCallback: there a timer set in
 * the next animation frame runs after that frame is painted. Node has neither and uses a timer.
 */
function schedule(task: () => void) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(() => task());
  else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(task));
  else setTimeout(task);
}

/** Runs `task` in an idle slot, once no hold is left. */
export function whenIdle(task: () => void) {
  if (holds) held.push(task);
  else schedule(task);
}

/** Holds idle work until the returned function runs; running it again does nothing. */
export function holdIdle(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--holds === 0) for (const task of held.splice(0)) schedule(task);
  };
}
