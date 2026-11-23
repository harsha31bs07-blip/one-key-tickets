import { roleLabels, rupees } from "./types.ts";
import type { Answers, Candidate, Seat } from "./types.ts";

export interface Offer {
  seats: Seat[];
  totalPaise: number;
  revision: number;
  reason: string;
  readBack: string;
}

export function makeOffer(candidate: Candidate, revision: number, answers: Answers): Offer {
  const { seats, totalPaise, zone } = candidate;
  const location = seats.every((seat) => seat.row === seats[0].row)
    ? `Row ${seats[0].row}, ${seats.length === 1 ? "seat" : "seats"} ${new Intl.ListFormat("en-IN").format(seats.map((seat) => String(seat.number)))}.`
    : `Seats ${new Intl.ListFormat("en-IN").format(seats.map((seat) => seat.id))}.`;
  const roles = seats.filter((seat) => seat.role !== "ordinary")
    .map((seat) => `${seat.id} ${roleLabels[seat.role]}`);
  const preference = [
    ...(answers.zone === zone ? [`your ${zone} preference`] : []),
    ...(answers.aisle === "aisle" && candidate.aisle ? ["your aisle preference"] : []),
  ];
  const fit = answers.party === "wheelchairPair"
    ? "The wheelchair space and its designated companion are available together"
    : seats.length === 1 ? "This seat is available" : "These seats are together in one block";
  const reason = `${fit}${typeof answers.budget === "number" ? " within your budget" : ""}${preference.length ? ` and match ${preference.join(" and ")}` : ""}.`;
  const readBack = [location, ...(roles.length ? [`${roles.join(", ")}.`] : []),
    `${zone[0].toUpperCase()}${zone.slice(1)}.`, `${rupees(totalPaise)} total.`].join(" ");
  return { seats, totalPaise, revision, reason, readBack };
}

export function noMatch(answers: Answers): string {
  const party = answers.party === "wheelchairPair"
    ? "No wheelchair space with a companion seat is left"
    : answers.party === 1 ? "No standard seat is left" : `No group of ${answers.party} standard seats together is left`;
  return `${party}${typeof answers.budget === "number" ? ` up to ${rupees(answers.budget)}` : ""}.`;
}

export const offerOptions = [
  { id: "book", label: "Book these" },
  { id: "next", label: "Next option" },
  { id: "change", label: "Change my answers" },
  { id: "leave", label: "Leave" },
];
