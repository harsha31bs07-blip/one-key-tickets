export const defaultDwellMs = 1500;

export const estimateSpeechMs = (text: string) => 220 + text.trim().split(/\s+/).length * 280;

export const dwellFor = (index: number, dwellMs: number) => dwellMs * (index === 0 ? 1.5 : 1);

export const windowMs = (label: string, index: number, dwellMs: number) =>
  estimateSpeechMs(label) + dwellFor(index, dwellMs);

export const clampDwell = (dwellMs: number, minimum = 500) =>
  Math.min(4000, Math.max(minimum, dwellMs));
