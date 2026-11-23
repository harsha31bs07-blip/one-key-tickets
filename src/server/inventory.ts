import { randomUUID } from "node:crypto";
import type { Seat } from "../core/types.ts";
import type { Conflict, Hold, HoldRequest, Snapshot } from "./contracts.ts";

type HoldResult =
  | { status: 200; body: Hold }
  | { status: 409; body: Conflict };

export class Inventory {
  private revision = 0;
  private seats = new Map<string, Seat & { changedAtRevision: number }>();
  private requests = new Map<string, HoldResult>();

  constructor(seed: readonly Seat[]) {
    for (const seat of seed) this.seats.set(seat.id, { ...seat, changedAtRevision: 0 });
  }

  snapshot(): Snapshot {
    return {
      revision: this.revision,
      seats: [...this.seats.values()].map(({ id, status }) => ({ id, status })),
    };
  }

  reset(seed: readonly Seat[]): void {
    this.revision++;
    this.seats = new Map(seed.map((seat) => {
      const previous = this.seats.get(seat.id);
      const changedAtRevision = previous?.status === seat.status && previous.pricePaise === seat.pricePaise
        ? previous.changedAtRevision : this.revision;
      return [seat.id, { ...seat, changedAtRevision }];
    }));
  }

  hold(request: HoldRequest): HoldResult {
    const cached = this.requests.get(request.requestId);
    if (cached) return cached;
    const result = this.tryHold(request);
    this.requests.set(request.requestId, result);
    return result;
  }

  private tryHold({ offerRevision, seatIds, totalPaise }: HoldRequest): HoldResult {
    const conflict = (reason: Conflict["reason"], changedSeatIds: string[]): HoldResult =>
      ({ status: 409, body: { reason, changedSeatIds } });
    if (!seatIds.length || new Set(seatIds).size !== seatIds.length) {
      return conflict("invalid-seats", []);
    }
    const unavailable = seatIds.filter((id) => this.seats.get(id)?.status !== "available");
    const changed = seatIds.filter((id) => (this.seats.get(id)?.changedAtRevision ?? 0) > offerRevision);
    if (unavailable.length) return conflict("unavailable", [...new Set([...unavailable, ...changed])]);
    if (changed.length) return conflict("changed", changed);
    const seats = seatIds.map((id) => this.seats.get(id)!);
    if (seats.reduce((total, seat) => total + seat.pricePaise, 0) !== totalPaise) {
      return conflict("wrong-total", []);
    }

    this.revision++;
    for (const seat of seats) {
      seat.status = "held";
      seat.changedAtRevision = this.revision;
    }
    return { status: 200, body: { holdId: randomUUID(), seats: [...seatIds], totalPaise } };
  }
}
