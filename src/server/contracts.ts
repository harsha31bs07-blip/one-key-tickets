import type { SeatStatus } from "../core/types.ts";

export interface Snapshot {
  revision: number;
  seats: { id: string; status: SeatStatus }[];
}

export interface HoldRequest {
  requestId: string;
  offerRevision: number;
  seatIds: string[];
  totalPaise: number;
}

export interface Hold {
  holdId: string;
  seats: string[];
  totalPaise: number;
}

export interface Conflict {
  reason: "unavailable" | "changed" | "wrong-total" | "invalid-seats";
  changedSeatIds: string[];
}
