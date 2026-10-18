// The public surface of features/battle: everything other features, the kernel and the app may use.
export { clearIdleBattleAnimations, preloadBattleAnimations } from './battle-animation.ts';
export { type BattleBackdrop, battleImageSources, campaignBackdrop, entersTower, locationBackdrop, towerBackdrop } from './battle-backdrop.ts';
export { preloadBattleImages, waitForBattleLoad } from './battle-loading.ts';
export { advanceBattlePresentation, type BattlePresentationState } from './battle-presentation.ts';
export { type BattleAction, battleFeature, type BattleSlice } from './feature.ts';
