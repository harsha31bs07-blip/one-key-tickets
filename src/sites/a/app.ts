import { roleLabels, rupees } from "../../core/types.ts";
import type { Seat, SeatStatus } from "../../core/types.ts";
import { demoSeats } from "../../demo.ts";
import type { Conflict, Hold, HoldRequest, Snapshot } from "../../server/contracts.ts";

const api = "http://127.0.0.1:5100/api";
const holdKey = "orion-demo-hold";

function mountMap(map: HTMLElement): void {
  const continueButton = document.querySelector<HTMLButtonElement>("#continue")!;
  const status = document.querySelector<HTMLElement>("#booking-status")!;
  const total = document.querySelector<HTMLElement>("#total")!;
  const seats = demoSeats();
  const buttons = new Map<string, HTMLButtonElement>();
  const availability = new Map<string, SeatStatus>();
  const selected = new Set<string>();
  let revision = -1;
  let pending = false;

  function renderSeat(seat: Seat): void {
    const button = buttons.get(seat.id)!;
    const seatStatus = availability.get(seat.id) ?? seat.status;
    const pressed = selected.has(seat.id);
    button.dataset.status = seatStatus;
    button.disabled = revision < 0 || seatStatus !== "available";
    button.setAttribute("aria-pressed", String(pressed));
    button.setAttribute("aria-label", `${seat.id}, ${roleLabels[seat.role]}, ${rupees(seat.pricePaise)}, ${seatStatus}`);
    const marker = seatStatus !== "available" ? "×" :
      pressed ? "✓" : seat.role === "wheelchairSpace" ? "W" : seat.role === "companion" ? "C" : "";
    button.querySelector("span")!.textContent = marker;
  }

  const selection = () => seats.filter((seat) => selected.has(seat.id));
  const cost = (group: Seat[]) => group.reduce((sum, seat) => sum + seat.pricePaise, 0);
  const updateTotal = () => { total.textContent = rupees(cost(selection())); };

  let row: HTMLDivElement | undefined;
  let block: HTMLDivElement | undefined;
  for (const seat of seats) {
    if (row?.dataset.row !== seat.row) {
      row = document.createElement("div");
      row.className = "row";
      row.dataset.row = seat.row;
      row.dataset.zone = seat.zone;
      const rowLabel = document.createElement("span");
      rowLabel.className = "row-label";
      rowLabel.textContent = seat.row;
      row.append(rowLabel);
      map.append(row);
      block = undefined;
    }
    if (block?.dataset.block !== seat.block) {
      block = document.createElement("div");
      block.className = "block";
      block.dataset.block = seat.block;
      row.append(block);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "seat";
    Object.assign(button.dataset, {
      seatId: seat.id, number: String(seat.number), role: seat.role, pricePaise: String(seat.pricePaise),
    });
    if (seat.companionOf) button.dataset.companionOf = seat.companionOf;
    const marker = document.createElement("span");
    marker.setAttribute("aria-hidden", "true");
    button.append(String(seat.number), marker);
    button.addEventListener("click", () => {
      if (pending || button.disabled) return;
      if (selected.has(seat.id)) selected.delete(seat.id);
      else selected.add(seat.id);
      renderSeat(seat);
      updateTotal();
      status.textContent = "";
    });
    buttons.set(seat.id, button);
    block.append(button);
    renderSeat(seat);
  }

  function update(snapshot: Snapshot): void {
    if (snapshot.revision <= revision) return;
    const firstSnapshot = revision < 0;
    revision = snapshot.revision;
    const lost: string[] = [];
    for (const { id, status } of snapshot.seats) {
      if (availability.get(id) === status && !firstSnapshot) continue;
      availability.set(id, status);
      if (status !== "available" && selected.delete(id)) lost.push(id);
      const seat = seats.find((item) => item.id === id);
      if (seat) renderSeat(seat);
    }
    map.dataset.revision = String(revision);
    continueButton.disabled = pending;
    updateTotal();
    if (lost.length && !pending) status.textContent = `${lost.join(", ")} became unavailable.`;
    else if (firstSnapshot) status.textContent = "";
  }

  const events = new EventSource(`${api}/events`);
  events.onmessage = (event: MessageEvent<string>) => update(JSON.parse(event.data) as Snapshot);
  events.onerror = () => {
    if (revision < 0) status.textContent = "Waiting for live availability. Start the local cinema server.";
  };
  window.addEventListener("pagehide", () => events.close());
  window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });

  continueButton.addEventListener("click", async () => {
    if (pending || revision < 0) return;
    const group = selection();
    if (!group.length) {
      status.textContent = "Choose a seat before continuing.";
      return;
    }

    const request: HoldRequest = {
      requestId: crypto.randomUUID(),
      offerRevision: revision,
      seatIds: group.map(({ id }) => id),
      totalPaise: cost(group),
    };
    pending = true;
    continueButton.disabled = true;
    map.dataset.booking = "pending";
    delete map.dataset.changedSeats;
    status.textContent = "Checking seat availability…";
    try {
      const response = await fetch(`${api}/hold`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
      });
      if (response.status === 409) {
        const conflict = await response.json() as Conflict;
        selected.clear();
        for (const seat of group) renderSeat(seat);
        updateTotal();
        try {
          const snapshot = await fetch(`${api}/snapshot`);
          if (snapshot.ok) update(await snapshot.json() as Snapshot);
        } finally {
          status.textContent = conflict.changedSeatIds.length
            ? `Availability changed for ${conflict.changedSeatIds.join(", ")}. Choose your seats again.`
            : "The seat total changed. Choose your seats again.";
          map.dataset.changedSeats = JSON.stringify(conflict.changedSeatIds);
          map.dataset.booking = "stale";
        }
        return;
      }
      if (!response.ok) throw new Error(`Hold failed (${response.status})`);
      const hold = await response.json() as Hold;
      sessionStorage.setItem(holdKey, JSON.stringify(hold));
      map.dataset.booking = "held";
      location.assign(`/summary.html?hold=${encodeURIComponent(hold.holdId)}`);
    } catch {
      if (map.dataset.booking !== "stale") {
        status.textContent = "Could not confirm the hold. Check availability and try again.";
        map.dataset.booking = "error";
      }
    } finally {
      if (map.dataset.booking !== "held") {
        pending = false;
        continueButton.disabled = false;
      }
    }
  });
}

function mountSummary(summary: HTMLElement): void {
  const raw = sessionStorage.getItem(holdKey);
  const hold = raw ? JSON.parse(raw) as Hold : undefined;
  const id = new URLSearchParams(location.search).get("hold");
  const message = document.querySelector("#summary-message")!;
  if (!hold || id !== hold.holdId) {
    message.textContent = "Open the seat map to make a demo hold.";
    return;
  }
  summary.dataset.holdId = hold.holdId;
  summary.dataset.seats = JSON.stringify(hold.seats);
  summary.dataset.totalPaise = String(hold.totalPaise);
  document.querySelector("#summary-title")!.textContent = "Booking held";
  message.textContent = "Seats held. Demo: no payment is taken.";
  document.querySelector("#summary-details")!.textContent = `${hold.seats.join(", ")} · ${rupees(hold.totalPaise)} total`;
}

const map = document.querySelector<HTMLElement>("#seat-map");
const summary = document.querySelector<HTMLElement>("#hold-summary");
if (map) mountMap(map);
if (summary) mountSummary(summary);
