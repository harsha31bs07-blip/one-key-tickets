import assert from "node:assert/strict";
import { test } from "node:test";
import { demoSeats } from "../../src/demo.ts";
import type { HoldRequest } from "../../src/server/contracts.ts";
import { Inventory } from "../../src/server/inventory.ts";

const pair: HoldRequest = { requestId: "pair", offerRevision: 0, seatIds: ["E13", "E14"], totalPaise: 44000 };
const rival: HoldRequest = { requestId: "rival", offerRevision: 0, seatIds: ["E14"], totalPaise: 22000 };

test("an unavailable seat rejects the whole hold", () => {
  const inventory = new Inventory(demoSeats());
  assert.equal(inventory.hold(rival).status, 200);
  const before = inventory.snapshot();
  assert.deepEqual(inventory.hold(pair), { status: 409, body: { reason: "unavailable", changedSeatIds: ["E14"] } });
  assert.deepEqual(inventory.snapshot(), before);
});

test("a seat that became available again still invalidates an old offer revision", () => {
  const inventory = new Inventory(demoSeats());
  assert.equal(inventory.hold(rival).status, 200);
  inventory.reset(demoSeats());
  const before = inventory.snapshot();
  assert.deepEqual(inventory.hold(pair), { status: 409, body: { reason: "changed", changedSeatIds: ["E14"] } });
  assert.deepEqual(inventory.snapshot(), before);
});

test("an incorrect total is rejected atomically and cached for the same request ID", () => {
  const inventory = new Inventory(demoSeats());
  const before = inventory.snapshot();
  const wrong = inventory.hold({ ...pair, totalPaise: 43000 });
  assert.deepEqual(wrong, { status: 409, body: { reason: "wrong-total", changedSeatIds: [] } });
  assert.deepEqual(inventory.hold(pair), wrong);
  assert.deepEqual(inventory.snapshot(), before);
});

test("a successful request is idempotent and unrelated inventory revisions do not invalidate a hold", () => {
  const inventory = new Inventory(demoSeats());
  assert.equal(inventory.hold({ ...rival, seatIds: ["D2"] }).status, 200);
  const result = inventory.hold(pair);
  assert.equal(result.status, 200);
  const after = inventory.snapshot();
  assert.equal(after.revision, 2);
  assert.ok(after.seats.filter(({ id }) => pair.seatIds.includes(id)).every(({ status }) => status === "held"));
  assert.deepEqual(inventory.hold({ ...pair, totalPaise: 1 }), result);
  assert.deepEqual(inventory.snapshot(), after);
});
