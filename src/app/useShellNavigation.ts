import { useState } from 'react';
import { TOOLBAR_RESETS, type WindowFocus, type WindowKind } from './shell-navigation.ts';
import type { WorldLocationId } from '../domain/world/world.ts';

/** A request for the world map to land somewhere; a new `requestId` repeats the same destination. */
export interface TravelRequest extends WorldLocationId { bossId?: string; requestId: number }
export interface ShellNavigation {
  windowKind: WindowKind | null;
  /** Initial selections for the window being opened. */
  focus: WindowFocus;
  /** The campaign whose stage scene replaces the world map. */
  campaignId: string | null;
  travelTo?: TravelRequest;
}

/** Which scene window, campaign scene and world-map landing the shell shows. Every update is functional, so callers may hold old copies. */
export function useShellNavigation() {
  const [nav, setNav] = useState<ShellNavigation>({ windowKind: null, focus: {}, campaignId: null });
  const focused = (old: ShellNavigation, focus: WindowFocus) => ({ ...old.focus, ...focus });
  return {
    nav,
    /** Show a window (or none) with these selections; `leaveCampaign` also returns to the world map. */
    show(windowKind: WindowKind | null, focus: WindowFocus = {}, leaveCampaign = false) {
      setNav(old => ({ ...old, windowKind, focus: focused(old, focus), campaignId: leaveCampaign ? null : old.campaignId }));
    },
    close() { setNav(old => ({ ...old, windowKind: null })); },
    /** The toolbar opens a window afresh, or closes it when it is already open. */
    toggle(windowKind: WindowKind) {
      const reset = TOOLBAR_RESETS[windowKind];
      setNav(old => ({ ...old, windowKind: old.windowKind === windowKind ? null : windowKind, focus: reset ? focused(old, { [reset]: undefined }) : old.focus }));
    },
    /** Land the world map at a destination, leaving any campaign scene; `windowKind` opens over the landing. */
    travel(destination: WorldLocationId & { bossId?: string }, windowKind: WindowKind | null = null, focus: WindowFocus = {}) {
      setNav(old => ({ ...old, campaignId: null, travelTo: { ...destination, requestId: Date.now() }, windowKind, focus: focused(old, focus) }));
    },
    enterCampaign(campaignId: string) { setNav(old => ({ ...old, campaignId, windowKind: null })); },
    leaveCampaign() { setNav(old => ({ ...old, campaignId: null })); },
  };
}
