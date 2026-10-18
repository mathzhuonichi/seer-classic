// The public surface of features/engravings: everything other features, the kernel and the app may use.
export { type EngravingsAction, engravingsFeature } from './feature.ts';
export { engravingOptions, engravingView } from './options.ts';
export { clearEngravingDeficit, engravingHolder, engravingLoadout, equippedEngravingCounts, equippedEngravings, settleEngravingResource } from './loadout.ts';
