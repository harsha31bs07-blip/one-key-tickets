import { blockKey } from "./graph.ts";
import type { SeatGraph } from "./graph.ts";
import type { Answers, Candidate, Party, Seat } from "./types.ts";

function describe(graph: SeatGraph, seats: Seat[]): Candidate {
  const first = seats[0];
  const block = graph.blocks.get(blockKey(first))!;
  const number = seats.reduce((sum, seat) => sum + seat.number, 0) / seats.length;
  const row = seats.reduce((sum, seat) => sum + graph.rows.indexOf(seat.row), 0) / seats.length;
  return {
    seats,
    totalPaise: seats.reduce((sum, seat) => sum + seat.pricePaise, 0),
    zone: first.zone,
    aisle: seats.some((seat) => {
      const ownBlock = graph.blocks.get(blockKey(seat))!;
      const rowSeats = [...graph.nodes.values()].filter((other) => other.row === seat.row);
      return (seat === ownBlock[0] && rowSeats.some((other) => other.number < seat.number)) ||
        (seat === ownBlock.at(-1) && rowSeats.some((other) => other.number > seat.number));
    }),
    blockDistance: Math.abs(number - (block[0].number + block.at(-1)!.number) / 2),
    screenDistance: Math.hypot(number - graph.screenCenter, row - (graph.rows.length - 1) / 2),
  };
}

export function candidatesFor(graph: SeatGraph, party: Party): Candidate[] {
  const candidates: Candidate[] = [];
  if (party === "wheelchairPair") {
    for (const companion of graph.nodes.values()) {
      if (companion.role !== "companion" || companion.status !== "available" || !companion.companionOf) continue;
      const space = graph.nodes.get(companion.companionOf);
      if (space?.role === "wheelchairSpace" && space.status === "available") {
        candidates.push(describe(graph, [space, companion]));
      }
    }
  } else {
    for (const block of graph.blocks.values()) {
      for (let index = 0; index <= block.length - party; index++) {
        const seats = block.slice(index, index + party);
        if (seats.every((seat, position) =>
          seat.status === "available" && seat.role === "ordinary" &&
          (position === 0 || graph.neighbors.get(seats[position - 1].id)?.includes(seat.id))
        )) {
          candidates.push(describe(graph, seats));
        }
      }
    }
  }
  return candidates;
}

export const candidateId = (candidate: Candidate) => candidate.seats.map((seat) => seat.id).join("+");

export function rank(candidates: readonly Candidate[], answers: Answers): Candidate[] {
  const matches = (candidate: Candidate) =>
    Number(candidate.zone === answers.zone) + Number(candidate.aisle && answers.aisle === "aisle");
  return candidates
    .filter((candidate) => typeof answers.budget !== "number" || candidate.totalPaise <= answers.budget)
    .sort((a, b) =>
      matches(b) - matches(a) ||
      a.blockDistance - b.blockDistance ||
      a.screenDistance - b.screenDistance ||
      a.totalPaise - b.totalPaise ||
      (candidateId(a) < candidateId(b) ? -1 : Number(candidateId(a) > candidateId(b)))
    );
}
