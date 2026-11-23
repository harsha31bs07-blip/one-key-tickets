import fixture from "../fixtures/demo1.json" with { type: "json" };
import { zones } from "./core/types.ts";
import type { Seat, SeatRole } from "./core/types.ts";

export { fixture };

export function demoSeats(): Seat[] {
  const sold = new Set(fixture.sold);
  return zones.flatMap((zone) => {
    const { rows, pricePaise } = fixture.zones[zone];
    return rows.flatMap((row) => fixture.blocks.flatMap(([start, end], block) =>
      Array.from({ length: end - start + 1 }, (_, offset) => {
        const number = start + offset;
        const id = row + number;
        const pair = fixture.wheelchairPairs.find(({ space, companion }) => id === space || id === companion);
        const role: SeatRole = !pair ? "ordinary" : id === pair.space ? "wheelchairSpace" : "companion";
        return {
          id, row, number, block: String(block), zone, pricePaise, role,
          ...(role === "companion" && pair ? { companionOf: pair.space } : {}),
          status: sold.has(id) ? "sold" : "available",
        };
      })
    ));
  });
}
