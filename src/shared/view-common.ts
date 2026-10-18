// Small display rules shared by the controller's snapshot builders.
import { STATUS_LABELS, TYPE_LABELS } from './labels.ts';

export const portrait = (species: number) => `/portraits/${species}.png`;
export const typeLabel = (type: string) => TYPE_LABELS[type] ?? type;
export const statusLabel = (id: string) => STATUS_LABELS[id];
