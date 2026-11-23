import type { Seat } from "./types.ts";

export interface SeatGraph {
  nodes: Map<string, Seat>;
  neighbors: Map<string, string[]>;
  blocks: Map<string, Seat[]>;
  rows: string[];
  screenCenter: number;
}

export const blockKey = (seat: Seat) => JSON.stringify([seat.row, seat.block]);

export function buildGraph(seats: readonly Seat[]): SeatGraph {
  const nodes = new Map(seats.map((seat) => [seat.id, seat]));
  const neighbors = new Map(seats.map((seat) => [seat.id, [] as string[]]));
  const blocks = new Map<string, Seat[]>();
  for (const seat of seats) {
    const key = blockKey(seat);
    const block = blocks.get(key) ?? [];
    block.push(seat);
    blocks.set(key, block);
  }
  for (const block of blocks.values()) {
    block.sort((a, b) => a.number - b.number);
    for (const [index, seat] of block.entries()) {
      const next = block[index + 1];
      if (next && next.number === seat.number + 1) {
        neighbors.get(seat.id)?.push(next.id);
        neighbors.get(next.id)?.push(seat.id);
      }
    }
  }
  const numbers = seats.map((seat) => seat.number);
  return {
    nodes, neighbors, blocks,
    rows: [...new Set(seats.map((seat) => seat.row))].sort(),
    screenCenter: numbers.length ? (Math.min(...numbers) + Math.max(...numbers)) / 2 : 0,
  };
}
