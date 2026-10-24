// The public surface of features/challenges: everything other features, the kernel and the app may use.
export { campaignBackdrop, campaignLocation, entersTower, towerBackdrop } from './battle-backdrops.ts';
export { startEncounter } from './battle-starts.ts';
export { type ChallengesAction, challengesFeature, type ChallengesSlice } from './feature.ts';
export { campaignProgress } from './progress-views.ts';
