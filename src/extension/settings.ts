import type { Counters } from "../core/scan.ts";
import { clampDwell, defaultDwellMs } from "../core/timing.ts";

export interface Settings {
  dwellMs: number;
  speech: boolean;
  adaptive: boolean;
  key: string;
}

export type GenericMode = "linear" | "row-column";
export type Mode = "one-key" | GenericMode;

export interface ComparisonMessage {
  type: "comparison";
  mode: GenericMode;
  target: string[];
}

export interface RunResult extends Counters {
  mode: Mode;
  task: string;
  seats: string[];
  totalPaise: number;
}

export const settingsKey = "settings";
export const resultPrefix = "run:";

export function normalizeKey(key: string): string {
  const trimmed = key.trim();
  return !trimmed || trimmed.toLowerCase() === "space" ? "Space" :
    trimmed.length === 1 ? trimmed.toLowerCase() : trimmed;
}

export function readSettings(value: unknown): Settings {
  const stored = value && typeof value === "object" ? value as Partial<Settings> : {};
  return {
    dwellMs: typeof stored.dwellMs === "number" && Number.isFinite(stored.dwellMs)
      ? clampDwell(stored.dwellMs) : defaultDwellMs,
    speech: stored.speech !== false,
    adaptive: stored.adaptive !== false,
    key: typeof stored.key === "string" ? normalizeKey(stored.key) : "Space",
  };
}

export function isComparison(message: unknown): message is ComparisonMessage {
  if (!message || typeof message !== "object") return false;
  const value = message as Partial<ComparisonMessage>;
  return value.type === "comparison" && (value.mode === "linear" || value.mode === "row-column") &&
    Array.isArray(value.target) && value.target.length === 2 && value.target[0] !== value.target[1] &&
    value.target.every((seat: unknown) => typeof seat === "string");
}
