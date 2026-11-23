import { rupees } from "../core/types.ts";
import { readSettings, resultPrefix, settingsKey } from "./settings.ts";
import type { ComparisonMessage, GenericMode, RunResult } from "./settings.ts";

const dwell = document.querySelector<HTMLInputElement>("#dwell")!;
const speech = document.querySelector<HTMLInputElement>("#speech")!;
const adaptive = document.querySelector<HTMLInputElement>("#adaptive")!;
const key = document.querySelector<HTMLInputElement>("#switch-key")!;
const status = document.querySelector<HTMLElement>("#status")!;
const mode = document.querySelector<HTMLSelectElement>("#mode")!;
const targets = document.querySelector<HTMLInputElement>("#targets")!;
const results = document.querySelector<HTMLElement>("#results")!;
const names = { "one-key": "One-Key", linear: "Linear", "row-column": "Row-column" };

function renderResult(result: RunResult): HTMLElement {
  const card = document.createElement("article");
  const title = document.createElement("h3");
  title.textContent = names[result.mode];
  const task = document.createElement("p");
  task.textContent = result.task;
  const completion = document.createElement("p");
  completion.textContent = result.completed ? "Completed" : "Incomplete";
  const summary = document.createElement("dl");
  const fields = [
    ["Presses", String(result.presses)],
    ["Scan windows", String(result.scanWindows)],
    ["Seconds", (result.elapsedMs / 1000).toFixed(1)],
    ["Corrections", String(result.corrections)],
    ["Seats", result.seats.join(", ") || "—"],
    ["Total", rupees(result.totalPaise)],
  ];
  for (const [label, value] of fields) {
    const row = document.createElement("div");
    const term = document.createElement("dt");
    const amount = document.createElement("dd");
    term.textContent = label;
    amount.textContent = value;
    row.append(term, amount);
    summary.append(row);
  }
  card.append(title, task, completion, summary);
  return card;
}

async function showResults(): Promise<void> {
  const values = await chrome.storage.local.get(null);
  const cards = Object.keys(values).filter((id) => id.startsWith(resultPrefix)).sort().reverse().slice(0, 5)
    .map((id) => renderResult(values[id] as RunResult));
  if (cards.length) results.replaceChildren(...cards);
  else results.textContent = "No runs yet.";
}

async function initialize(): Promise<void> {
  const values = await chrome.storage.local.get(settingsKey);
  const settings = readSettings(values[settingsKey]);
  dwell.value = String(settings.dwellMs);
  speech.checked = settings.speech;
  adaptive.checked = settings.adaptive;
  key.value = settings.key;
  await showResults();
}

document.querySelector("#settings")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = readSettings({ dwellMs: dwell.valueAsNumber, speech: speech.checked, adaptive: adaptive.checked, key: key.value });
  await chrome.storage.local.set({ [settingsKey]: settings });
  key.value = settings.key;
  status.textContent = "Settings saved.";
});

document.querySelector("#comparison")!.addEventListener("submit", async (event) => {
  event.preventDefault();
  const target = targets.value.trim().toUpperCase().split(/[\s,]+/);
  if (target.length !== 2 || target[0] === target[1]) {
    status.textContent = "Enter two different seat IDs.";
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab.id === undefined) throw new Error("No active tab");
    const message: ComparisonMessage = { type: "comparison", mode: mode.value as GenericMode, target };
    const response = await chrome.tabs.sendMessage(tab.id, message) as { ok?: boolean; error?: string };
    status.textContent = response.ok ? "Return to the cinema tab to scan." : response.error ?? "Could not start.";
  } catch {
    status.textContent = "Open the cinema seat map before starting a comparison.";
  }
});

document.querySelector("#reset-results")!.addEventListener("click", async () => {
  const values = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(values).filter((id) => id.startsWith(resultPrefix)));
  await showResults();
  status.textContent = "Results cleared.";
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some((key) => key.startsWith(resultPrefix))) void showResults();
});
void initialize();
