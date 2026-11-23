import { candidateId, rank } from "./planner.ts";
import { windowMs } from "./timing.ts";
import { rupees } from "./types.ts";
import type { Answers, Candidate } from "./types.ts";

export type QuestionId = keyof Answers;

export interface QuestionOption {
  id: string;
  label: string;
  value: NonNullable<Answers[QuestionId]>;
}

export interface Question {
  id: QuestionId;
  prompt: string;
  options: QuestionOption[];
}

export const backOption = { id: "back", label: "Back", hint: "Undo last answer" };

export const partyQuestion: Question = {
  id: "party",
  prompt: "Who needs seats?",
  options: [
    { id: "2", label: "Two seats together", value: 2 },
    { id: "wheelchairPair", label: "Wheelchair space + companion seat", value: "wheelchairPair" },
    { id: "1", label: "One seat", value: 1 },
    { id: "3", label: "Three seats together", value: 3 },
    { id: "4", label: "Four seats together", value: 4 },
  ],
};

function budgetBands(candidates: readonly Candidate[]): number[] {
  const totals = [...new Set(candidates.map((candidate) => candidate.totalPaise))].sort((a, b) => a - b);
  const rounded = [...new Set(totals.map((total) => Math.ceil(total / 10000) * 10000))];
  const distinctCaps = rounded.filter((band) => band < totals.at(-1)!);
  const bands = distinctCaps.length >= 2 ? distinctCaps : rounded.length >= 2 ? rounded : totals;
  if (bands.length <= 3) return bands;
  return [bands[0], bands[Math.floor(bands.length / 2)], bands.at(-1)!];
}

export function remainingQuestions(candidates: readonly Candidate[], answers: Answers): Question[] {
  const budget: Question = {
    id: "budget",
    prompt: "What is your total budget?",
    options: [
      ...budgetBands(candidates).map((value) => ({ id: String(value), label: `Up to ${rupees(value)} total`, value })),
      { id: "any", label: "Any price", value: "any" },
    ],
  };
  const questions: Question[] = [
    budget,
    {
      id: "zone", prompt: "Which part of the cinema?",
      options: [
        { id: "front", label: "Front", value: "front" },
        { id: "middle", label: "Middle", value: "middle" },
        { id: "back-zone", label: "Back", value: "back" },
        { id: "any", label: "No preference", value: "any" },
      ],
    },
    {
      id: "aisle", prompt: "Would you like an aisle seat?",
      options: [
        { id: "aisle", label: "Aisle seat please", value: "aisle" },
        { id: "any", label: "No preference", value: "any" },
      ],
    },
  ];
  return questions.filter((question) => answers[question.id] === undefined);
}

export function entropy(outcomes: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const result of outcomes) counts.set(result, (counts.get(result) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / outcomes.length;
    return sum - probability * Math.log2(probability);
  }, 0);
}

export interface IntentOutcome {
  answers: Answers;
  offer: string;
}

export function informationGain(profiles: readonly IntentOutcome[], id: QuestionId): number {
  const partitions = new Map<Answers[QuestionId], string[]>();
  for (const profile of profiles) {
    const value = profile.answers[id];
    const partition = partitions.get(value) ?? [];
    partition.push(profile.offer);
    partitions.set(value, partition);
  }
  return entropy(profiles.map((profile) => profile.offer)) -
    [...partitions.values()].reduce((sum, part) => sum + part.length / profiles.length * entropy(part), 0);
}

export function bestQuestion<T extends QuestionId>(
  profiles: readonly IntentOutcome[],
  questions: readonly { id: T; expectedMs: number }[],
): T | undefined {
  let best: T | undefined;
  let bestRate = 0;
  for (const { id, expectedMs } of questions) {
    const gain = informationGain(profiles, id);
    const rate = gain / expectedMs;
    if (gain > 1e-10 && rate > bestRate) {
      best = id;
      bestRate = rate;
    }
  }
  return best;
}

export function nextQuestion(candidates: readonly Candidate[], answers: Answers, dwellMs: number): Question | undefined {
  if (answers.party === undefined) return partyQuestion;
  const questions = remainingQuestions(candidates, answers);
  const intents = questions.reduce<Answers[]>((profiles, question) => profiles.flatMap((profile) =>
    question.options.map((option) => ({ ...profile, [question.id]: option.value }))
  ), [answers]);
  const profiles = intents.map((profile) => {
    const top = rank(candidates, profile)[0];
    return { answers: profile, offer: top ? candidateId(top) : "no-match" };
  });
  const id = bestQuestion(profiles, questions.map((question) => {
    let positionMs = 0;
    let totalMs = 0;
    for (const [index, option] of question.options.entries()) {
      positionMs += windowMs(option.label, index, dwellMs);
      totalMs += positionMs;
    }
    return { id: question.id, expectedMs: totalMs / question.options.length };
  }));
  return questions.find((question) => question.id === id);
}
