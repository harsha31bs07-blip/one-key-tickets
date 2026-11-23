export const zones = ["front", "middle", "back"] as const;
export type Zone = typeof zones[number];
export type SeatRole = "ordinary" | "wheelchairSpace" | "companion";
export type SeatStatus = "available" | "sold" | "held";

export interface Seat {
  id: string;
  row: string;
  number: number;
  block: string;
  zone: Zone;
  role: SeatRole;
  companionOf?: string;
  pricePaise: number;
  status: SeatStatus;
}

export interface SeatMap {
  revision: number;
  seats: Seat[];
}

export type Party = 1 | 2 | 3 | 4 | "wheelchairPair";

export interface Answers {
  party?: Party;
  budget?: number | "any";
  zone?: Zone | "any";
  aisle?: "aisle" | "any";
}

export interface Candidate {
  seats: Seat[];
  totalPaise: number;
  zone: Zone;
  aisle: boolean;
  blockDistance: number;
  screenDistance: number;
}

export const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: paise % 100 === 0 ? 0 : 2,
  }).format(paise / 100);

export const roleLabels: Record<SeatRole, string> = {
  ordinary: "standard seat",
  wheelchairSpace: "wheelchair space",
  companion: "companion seat",
};
