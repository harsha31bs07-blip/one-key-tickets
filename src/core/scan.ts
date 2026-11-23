export interface ScanOption {
  id: string;
  label: string;
  hint?: string;
}

export const scanSpeech = (option: ScanOption) =>
  option.hint ? `${option.label}. ${option.hint}.` : option.label;

export interface Counters {
  presses: number;
  scanWindows: number;
  elapsedMs: number;
  corrections: number;
  completed: boolean;
}

export function newCounters(): Counters {
  return { presses: 0, scanWindows: 0, elapsedMs: 0, corrections: 0, completed: false };
}

export function nextIndex(index: number, length: number): number {
  return (index + 1) % length;
}

export const comparisonLabel = "Generic scanning, for comparison";

export function targetPrompt(seats: readonly string[]): string {
  return `Select ${seats.join(" and ")}, then Continue.`;
}
