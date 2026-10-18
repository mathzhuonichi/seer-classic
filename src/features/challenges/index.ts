// The public surface of features/challenges: everything other features, the kernel and the app may use.
export { buildBossEncounterEvidence, buildBossEvidence } from './boss-evidence.ts';
export { startEncounter } from './battle-starts.ts';
export { type ChallengesAction, challengesFeature, type ChallengesSlice } from './feature.ts';
export { campaignProgress } from './progress-views.ts';
