import { buildGraph } from "../src/core/graph.ts";
import { makeOffer, offerOptions } from "../src/core/offer.ts";
import { candidatesFor, rank } from "../src/core/planner.ts";
import { nextQuestion } from "../src/core/questions.ts";
import { newCounters, scanSpeech, targetPrompt } from "../src/core/scan.ts";
import type { Counters, ScanOption } from "../src/core/scan.ts";
import { defaultDwellMs, estimateSpeechMs, windowMs } from "../src/core/timing.ts";
import { roleLabels, rupees } from "../src/core/types.ts";
import type { Answers, Seat } from "../src/core/types.ts";
import { demoSeats } from "../src/demo.ts";

const seats = demoSeats();
const graph = buildGraph(seats);
const available = seats.filter((seat) => seat.status === "available");
const toOption = (seat: Seat) => ({
  id: seat.id, label: `${seat.id}, ${roleLabels[seat.role]}, ${rupees(seat.pricePaise)}, available`,
});
const checkout = { id: "continue", label: "Continue" };

function choose(counters: Counters, options: readonly ScanOption[], id: string): void {
  const position = options.findIndex((option) => option.id === id);
  if (position < 0) throw new Error(`Target option ${id} is missing`);
  for (let index = 0; index < position; index++) {
    counters.elapsedMs += windowMs(scanSpeech(options[index]), index, defaultDwellMs);
  }
  counters.scanWindows += position + 1;
  counters.presses++;
}

function oneKey(desired: Required<Answers>): { counters: Counters; target: Seat[] } {
  const counters = newCounters();
  counters.presses = 1;
  const candidates = candidatesFor(graph, desired.party);
  let answers: Answers = {};
  for (let question = nextQuestion(candidates, answers, defaultDwellMs); question;
    question = nextQuestion(candidates, answers, defaultDwellMs)) {
    const value = desired[question.id];
    const option = question.options.find((item) => item.value === value);
    if (!option) throw new Error(`No option for ${question.id} = ${value}`);
    counters.elapsedMs += estimateSpeechMs(question.prompt);
    choose(counters, question.options, option.id);
    answers = { ...answers, [question.id]: value };
  }
  const candidate = rank(candidates, answers)[0];
  const offer = makeOffer(candidate, 0, answers);
  counters.elapsedMs += estimateSpeechMs(offer.readBack);
  choose(counters, offerOptions, "book");
  counters.completed = true;
  return { counters, target: offer.seats };
}

function generic(mode: "linear" | "row-column", target: Seat[]): Counters {
  const counters = newCounters();
  counters.elapsedMs = estimateSpeechMs(targetPrompt(target.map(({ id }) => id)));
  if (mode === "linear") {
    const options = [...available.map(toOption), checkout];
    for (const { id } of [...target, checkout]) choose(counters, options, id);
  } else {
    const rows = [...new Set(available.map(({ row }) => row))];
    const groups = [...rows.map((row) => ({ id: row, label: `Row ${row}` })), { id: "other", label: "Other controls" }];
    for (const { row, id } of target) {
      choose(counters, groups, row);
      choose(counters, available.filter((seat) => seat.row === row).map(toOption), id);
    }
    choose(counters, groups, "other");
    choose(counters, [checkout], checkout.id);
  }
  counters.completed = true;
  return counters;
}

const tasks: { name: string; answers: Required<Answers> }[] = [
  { name: "Wheelchair pair ≤ ₹500", answers: { party: "wheelchairPair", budget: 50000, zone: "any", aisle: "any" } },
  { name: "Two together, middle, aisle", answers: { party: 2, budget: "any", zone: "middle", aisle: "aisle" } },
  { name: "Two together, any", answers: { party: 2, budget: "any", zone: "any", aisle: "any" } },
];

console.log("## Simulated perfect user on the demo fixture\n");
console.log("| Task | Target seats | Method | Presses | Scan windows | Seconds |");
console.log("| --- | --- | --- | ---: | ---: | ---: |");
for (const { name, answers } of tasks) {
  const { counters, target } = oneKey(answers);
  const methods = [
    ["One-Key", counters],
    ["Linear", generic("linear", target)],
    ["Row-column", generic("row-column", target)],
  ] as const;
  for (const [method, result] of methods) {
    console.log(`| ${name} | ${target.map(({ id }) => id).join(", ")} | ${method} | ${result.presses} | ${result.scanWindows} | ${(result.elapsedMs / 1000).toFixed(1)} |`);
  }
}
console.log("\nAssumptions. Seeded inventory and the demo page's DOM order, 1.5 s dwell plus 50% on the first option,\n" +
  "shared speech estimates, and an immediate press when the target is highlighted. Every activated item restarts\n" +
  "at the first option or group. Generic runs begin after helper setup and use the seats One-Key offered.\n" +
  "One-Key counts its switch start. Times include unchosen scan windows and spoken prompts or read-back,\n" +
  "with no reaction time, retries, hold round trip, or inventory changes.");
