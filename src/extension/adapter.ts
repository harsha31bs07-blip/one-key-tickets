import { roleLabels, zones } from "../core/types.ts";
import type { Seat, SeatMap, SeatRole, SeatStatus, Zone } from "../core/types.ts";

export interface PageSelection {
  seats: string[];
  totalPaise: number;
}

export interface SiteAdapter {
  map: HTMLElement;
  read(): SeatMap | undefined;
  seatButton(id: string): HTMLButtonElement | undefined;
  selection(): PageSelection;
  continueButton: HTMLButtonElement;
  observe(listener: (touched: string[]) => void): void;
}

const seatRoles: readonly string[] = ["ordinary", "wheelchairSpace", "companion"];
const seatStatuses: readonly string[] = ["available", "sold", "held"];
const seatSelector = "button[data-seat-id]";

export function siteAdapter(): SiteAdapter | undefined {
  const map = document.querySelector<HTMLElement>('section#seat-map[data-currency="INR"]');
  const continueButton = document.querySelector<HTMLButtonElement>("#continue");
  if (!map || !continueButton) return;

  const buttons = () => [...map.querySelectorAll<HTMLButtonElement>(seatSelector)];
  return {
    map,
    continueButton,
    read() {
      const rawRevision = map.dataset.revision;
      if (!rawRevision?.trim()) return;
      const revision = Number(rawRevision);
      if (!Number.isSafeInteger(revision) || revision < 0) return;
      const seats: Seat[] = [];
      for (const button of buttons()) {
        const { seatId: id, number, pricePaise, role, status, companionOf } = button.dataset;
        const row = button.closest<HTMLElement>(".row")?.dataset;
        const block = button.closest<HTMLElement>(".block")?.dataset.block;
        const seatNumber = Number(number);
        const price = Number(pricePaise);
        if (!id || !row?.row || !zones.includes(row.zone as Zone) || block === undefined ||
          !role || !seatRoles.includes(role) || !status || !seatStatuses.includes(status) ||
          !Number.isSafeInteger(seatNumber) || seatNumber < 1 || !Number.isSafeInteger(price) || price < 0) continue;
        seats.push({
          id, row: row.row, block, zone: row.zone as Zone, number: seatNumber,
          pricePaise: price, role: role as SeatRole, status: status as SeatStatus,
          ...(role === "companion" && companionOf ? { companionOf } : {}),
        });
      }
      return { revision, seats };
    },
    seatButton(id) {
      return buttons().find((button) => button.dataset.seatId === id);
    },
    selection() {
      const selected = buttons().filter((button) => button.getAttribute("aria-pressed") === "true");
      return {
        seats: selected.map((button) => button.dataset.seatId!),
        totalPaise: selected.reduce((sum, button) => sum + Number(button.dataset.pricePaise), 0),
      };
    },
    observe(listener) {
      new MutationObserver((records) => {
        const touched = records.flatMap((record) => {
          if (!(record.target instanceof HTMLButtonElement) || !record.attributeName ||
            record.oldValue === record.target.getAttribute(record.attributeName)) return [];
          return record.target.dataset.seatId ? [record.target.dataset.seatId] : [];
        });
        listener(touched);
      }).observe(map, {
        childList: true, subtree: true, attributeOldValue: true,
        attributeFilter: [
          "data-revision", "data-booking", "data-status", "data-price-paise",
          "data-role", "data-companion-of", "data-number", "data-zone", "data-row", "data-block",
        ],
      });
    },
  };
}

export function showSeats(adapter: SiteAdapter, seats: readonly Seat[]): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-one-key-offer]")) {
    delete button.dataset.oneKeyOffer;
    delete button.dataset.oneKeyBadge;
  }
  for (const [index, seat] of seats.entries()) {
    const button = adapter.seatButton(seat.id);
    if (!button) continue;
    button.dataset.oneKeyOffer = seat.role === "ordinary" ? seat.id :
      `${seat.id} ${seat.role === "companion" ? "companion" : roleLabels[seat.role]}`;
    button.dataset.oneKeyBadge = String(index % 2);
  }
}

export function actionableElements(): HTMLElement[] {
  const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]';
  return [...document.querySelectorAll<HTMLElement>(selector)].filter((element) =>
    !element.matches(':disabled, [aria-disabled="true"]') && !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
    element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible"
  );
}

export function actionLabel(element: HTMLElement): string {
  return element.getAttribute("aria-label") || element.textContent?.trim() || element.title || element.tagName.toLowerCase();
}

export function sameSeats(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}
