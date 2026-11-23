import { comparisonLabel } from "../core/scan.ts";
import type { Counters, ScanOption } from "../core/scan.ts";
import css from "./overlay.css";
import type { Mode } from "./settings.ts";

const mapStyles = `
  [data-one-key-focus], button[data-one-key-offer] {
    outline: 3px solid #ffe281 !important;
    outline-offset: 2px;
  }
  button[data-one-key-offer] { z-index: 1; }
  button[data-one-key-offer]::after {
    content: attr(data-one-key-offer);
    position: absolute;
    right: 0;
    bottom: calc(100% + 5px);
    pointer-events: none;
    white-space: nowrap;
    background: #ffe281;
    color: #17202b;
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 15px;
    font-weight: 750;
  }
  button[data-one-key-badge="1"]::after { top: calc(100% + 5px); bottom: auto; }
`;

export class Overlay {
  private host = document.createElement("div");
  private shadow = this.host.attachShadow({ mode: "open" });
  private panel: HTMLElement;
  private idle: HTMLElement;
  private hint: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private detail: HTMLElement;
  private reason: HTMLElement;
  private options: HTMLElement;
  private mode: HTMLElement;
  private counts: HTMLElement;
  private live: HTMLElement;
  private paused: HTMLElement;
  readonly start: HTMLButtonElement;

  constructor() {
    this.host.id = "one-key-tickets";
    this.shadow.innerHTML = `
      <style>${css}</style>
      <section class="panel" role="dialog" aria-label="One-Key Tickets">
        <div class="inner">
          <div class="idle"><button class="start" type="button" disabled>Start One-Key</button><p></p></div>
          <div class="body" hidden>
            <div class="bar"><span class="mode"></span><span class="counts"></span></div>
            <p class="paused" hidden>Scanning paused. Return to this tab to resume.</p>
            <h2></h2><p class="detail" hidden></p><p class="reason" hidden></p>
            <ul class="options" aria-label="Switch options"></ul>
          </div>
          <div class="live" aria-live="polite" aria-atomic="true"></div>
        </div>
      </section>`;
    const find = (selector: string) => this.shadow.querySelector<HTMLElement>(selector)!;
    this.panel = find(".panel");
    this.idle = find(".idle");
    this.hint = find(".idle p");
    this.body = find(".body");
    this.title = find("h2");
    this.detail = find(".detail");
    this.reason = find(".reason");
    this.options = find(".options");
    this.mode = find(".mode");
    this.counts = find(".counts");
    this.live = find(".live");
    this.paused = find(".paused");
    this.start = this.shadow.querySelector<HTMLButtonElement>(".start")!;
    const style = document.createElement("style");
    style.textContent = mapStyles;
    document.head.append(style);
    document.body.append(this.host);
    new ResizeObserver(() => {
      const height = this.panel.getBoundingClientRect().height;
      this.host.style.height = `${height}px`;
    }).observe(this.panel);
  }

  showStart(key: string, ready: boolean): void {
    this.body.hidden = true;
    this.idle.hidden = false;
    this.start.disabled = !ready;
    this.hint.textContent = ready ? `Press ${key} to start.` : "Waiting for the seat map.";
  }

  show(mode: Mode, title: string, options: readonly ScanOption[], detail = "", reason = ""): void {
    this.idle.hidden = true;
    this.body.hidden = false;
    this.mode.textContent = mode === "one-key" ? "One-Key Tickets" :
      `${comparisonLabel} · ${mode === "linear" ? "Linear" : "Row-column"}`;
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.detail.hidden = !detail;
    this.reason.textContent = reason;
    this.reason.hidden = !reason;
    this.setOptions(options);
  }

  setOptions(options: readonly ScanOption[]): void {
    this.options.replaceChildren(...options.map((option) => {
      const item = document.createElement("li");
      item.dataset.option = option.id;
      item.textContent = option.label;
      if (option.hint) {
        const hint = document.createElement("small");
        hint.className = "hint";
        hint.textContent = option.hint;
        item.append(hint);
      }
      return item;
    }));
  }

  highlight(index: number): void {
    for (const [position, item] of [...this.options.children].entries()) {
      item.toggleAttribute("data-active", position === index);
      if (position === index) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
  }

  caption(text: string): void {
    this.live.textContent = text;
  }

  pause(paused: boolean): void {
    this.paused.hidden = !paused;
  }

  update({ presses, elapsedMs }: Counters): void {
    this.counts.textContent = `${presses} ${presses === 1 ? "press" : "presses"} · ${(elapsedMs / 1000).toFixed(1)} s`;
  }

  reveal(element: HTMLElement): void {
    const bounds = element.getBoundingClientRect();
    if (bounds.left < 0 || bounds.right > innerWidth ||
      bounds.top < 28 || bounds.bottom + 28 > this.panel.getBoundingClientRect().top) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }
}
