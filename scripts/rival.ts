import { randomUUID } from "node:crypto";
import { argv } from "node:process";
import { demoSeats } from "../src/demo.ts";
import type { HoldRequest, Snapshot } from "../src/server/contracts.ts";

const api = "http://127.0.0.1:5100/api";
const seat = demoSeats().find(({ id }) => id === argv[2]);
if (!seat) throw new Error("Usage: npm run rival -- <seatId>");
const snapshot = await fetch(`${api}/snapshot`);
if (!snapshot.ok) throw new Error(`Could not read inventory (${snapshot.status})`);
const { revision } = await snapshot.json() as Snapshot;
const body: HoldRequest = {
  requestId: randomUUID(), offerRevision: revision, seatIds: [seat.id], totalPaise: seat.pricePaise,
};
const response = await fetch(`${api}/hold`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
if (!response.ok) throw new Error(`Rival hold failed (${response.status}): ${await response.text()}`);
console.log(`Rival held ${seat.id}.`);
