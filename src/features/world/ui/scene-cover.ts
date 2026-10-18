/** Scene windows and their shield, modal dialogs such as the modifier, the battle loading screen, and a campaign stage scene. */
const SCENE_COVERS = '.scene-window,.scene-window-shield,.battle-loading,[aria-modal="true"],.campaign-scene';

/** While something covers the world scene, wildlife pauses and the keyboard does not walk the explorer or close its dialogue. */
export const sceneCovered = () => !!document.querySelector(SCENE_COVERS);
