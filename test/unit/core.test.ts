import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGraph } from "../../src/core/graph.ts";
import { makeOffer, noMatch } from "../../src/core/offer.ts";
import { candidateId, candidatesFor, rank } from "../../src/core/planner.ts";
import { bestQuestion, informationGain, nextQuestion } from "../../src/core/questions.ts";
import type { IntentOutcome } from "../../src/core/questions.ts";
import { demoSeats } from "../../src/demo.ts";

test("adjacency respects rows, consecutive numbers, and aisle breaks", () => {
  const graph = buildGraph(demoSeats());
  assert.deepEqual(graph.neighbors.get("A4"), ["A3"]);
  assert.deepEqual(graph.neighbors.get("A5"), ["A6"]);
  assert.ok(graph.neighbors.get("A7")?.includes("A8"));
  assert.equal(graph.neighbors.get("B7")?.includes("A7"), false);
  assert.deepEqual(buildGraph(demoSeats().filter(({ id }) => id === "A7" || id === "A9")).neighbors.get("A7"), []);
});

test("wheelchair pairs come only from explicit companion links", () => {
  const seats = demoSeats();
  assert.deepEqual(candidatesFor(buildGraph(seats), "wheelchairPair").map(candidateId), ["C1+C2", "E13+E14", "H5+H6"]);
  const withoutE14 = seats.filter(({ id }) => id !== "E14");
  assert.equal(withoutE14.find(({ id }) => id === "E12")?.role, "ordinary");
  assert.deepEqual(candidatesFor(buildGraph(withoutE14), "wheelchairPair").map(candidateId), ["C1+C2", "H5+H6"]);
});

test("ordinary parties use available ordinary seats within one block and obey the total budget", () => {
  const graph = buildGraph(demoSeats());
  for (const party of [1, 2, 3, 4] as const) {
    for (const { seats } of candidatesFor(graph, party)) {
      assert.equal(seats.length, party);
      assert.ok(seats.every((seat, index) => seat.role === "ordinary" && seat.status === "available" &&
        seat.row === seats[0].row && seat.block === seats[0].block && seat.number === seats[0].number + index));
    }
  }
  const pairs = candidatesFor(graph, 2);
  assert.deepEqual([...new Set(pairs.map(({ zone }) => zone))], ["front", "middle", "back"]);
  assert.equal(pairs.some((pair) => candidateId(pair) === "A4+A5"), false);
  assert.equal(pairs.some((pair) => candidateId(pair) === "A7+A8"), true);
  assert.ok(rank(pairs, { budget: 30000 }).every(({ totalPaise }) => totalPaise === 30000));
  assert.deepEqual(rank(pairs, { budget: 29999 }), []);
  const openRow = demoSeats().filter(({ row }) => row === "A").map((seat) => ({ ...seat, status: "available" as const }));
  assert.deepEqual(candidatesFor(buildGraph(openRow), 4).map(candidateId), [
    "A1+A2+A3+A4", "A5+A6+A7+A8", "A6+A7+A8+A9", "A7+A8+A9+A10", "A11+A12+A13+A14",
  ]);
});

test("ranking prefers the requested zone and aisle and is stable with different input orders", () => {
  const seats = demoSeats();
  const options = { zone: "middle", aisle: "aisle" } as const;
  const normal = rank(candidatesFor(buildGraph(seats), 2), options);
  const reversed = rank(candidatesFor(buildGraph(seats.toReversed()), 2), options);
  assert.equal(normal[0].zone, "middle");
  assert.equal(normal[0].aisle, true);
  assert.deepEqual(normal.map(candidateId), reversed.map(candidateId));
});

test("eight intents favor the budget split at equal cost and aisle when budget costs twice as much", () => {
  const profiles: IntentOutcome[] = Array.from({ length: 8 }, (_, index) => ({
    answers: { budget: index < 4 ? 50000 : "any", aisle: index === 0 ? "aisle" : "any" },
    offer: String(index),
  }));
  assert.equal(informationGain(profiles, "budget"), 1);
  assert.ok(Math.abs(informationGain(profiles, "aisle") - 0.5435644432) < 1e-9);
  assert.equal(bestQuestion(profiles, [{ id: "budget", expectedMs: 3000 }, { id: "aisle", expectedMs: 3000 }]), "budget");
  assert.equal(bestQuestion(profiles, [{ id: "budget", expectedMs: 6000 }, { id: "aisle", expectedMs: 3000 }]), "aisle");
});

test("question selection starts with party and skips when every profile gives the same offer", () => {
  const candidates = candidatesFor(buildGraph(demoSeats()), "wheelchairPair");
  assert.equal(nextQuestion(candidates, {}, 1500)?.id, "party");
  assert.equal(nextQuestion(candidates.slice(0, 1), { party: "wheelchairPair" }, 1500), undefined);
  assert.equal(nextQuestion([], { party: "wheelchairPair" }, 1500), undefined);
});

test("wheelchair demo retains the ₹500 cap and explicit companion after a live change", () => {
  const seats = demoSeats();
  const answers = { party: "wheelchairPair", budget: 50000, zone: "any" } as const;
  const candidates = candidatesFor(buildGraph(seats), answers.party);
  const question = nextQuestion(candidates, { party: answers.party }, 1500);
  assert.equal(question?.id, "budget");
  assert.ok(question?.options.some(({ value, label }) => value === 50000 && label === "Up to ₹500 total"));
  const ranked = rank(candidates, answers);
  assert.deepEqual(ranked.map(candidateId), ["E13+E14", "C1+C2"]);
  const offer = makeOffer(ranked[0], 0, answers);
  assert.equal(offer.readBack, "Row E, seats 13 and 14. E13 wheelchair space, E14 companion seat. Middle. ₹440 total.");
  assert.equal(offer.totalPaise, 44000);
  seats.find(({ id }) => id === "E14")!.status = "held";
  const replacement = rank(candidatesFor(buildGraph(seats), answers.party), answers);
  assert.deepEqual(replacement.map(candidateId), ["C1+C2"]);
  assert.equal(makeOffer(replacement[0], 1, answers).totalPaise, 30000);
  seats.find(({ id }) => id === "C2")!.status = "held";
  assert.deepEqual(rank(candidatesFor(buildGraph(seats), answers.party), answers), []);
  assert.equal(noMatch(answers), "No wheelchair space with a companion seat is left up to ₹500.");
});
