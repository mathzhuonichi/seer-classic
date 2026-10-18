/** Scene windows and their shield, modal dialogs such as the modifier, and the battle loading screen. */
const SCENE_COVERS = '.scene-window,.scene-window-shield,.battle-loading,[aria-modal="true"]';

/** While something covers the world scene, wildlife pauses and the arrow keys do not walk the explorer. */
export const sceneCovered = () => !!document.querySelector(SCENE_COVERS);
