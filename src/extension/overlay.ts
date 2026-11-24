import { comparisonLabel } from "../core/scan.ts";
import type { Counters, ScanOption } from "../core/scan.ts";
import css from "./overlay.css";
import type { Mode } from "./settings.ts";

const mapStyles = `
  @media (min-width: 901px) { html.one-key-docked body { margin-right: 380px; } }
  [data-one-key-focus], button[data-one-key-offer] {
    outline: 3px solid #f4b740 !important;
    outline-offset: 2px;
    box-shadow: 0 0 0 7px #f4b74040 !important;
  }
  button[data-one-key-offer] { z-index: 1; }
  button[data-one-key-offer]::after {
    content: attr(data-one-key-badge);
    position: absolute;
    top: -9px;
    right: -9px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    pointer-events: none;
    background: #f4b740;
    color: #1d1a14;
    font: 800 11px/1 "Segoe UI", system-ui, sans-serif;
  }
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
  private keyLabel: HTMLElement;
  readonly start: HTMLButtonElement;

  constructor() {
    this.host.id = "one-key-tickets";
    this.shadow.innerHTML = `
      <style>${css}</style>
      <section class="panel" role="dialog" aria-label="One-Key Tickets" data-state="idle">
        <div class="inner">
          <div class="head"><span class="mark" aria-hidden="true"></span><span class="brand">One-Key Tickets</span><span class="counts"></span></div>
          <div class="idle"><p class="intro">Book seats that belong together, with one switch.</p><p class="steps">One-Key asks who is coming and your budget, finds seats that fit, and shows them on this map.</p><button class="start" type="button" disabled>Start One-Key</button><p class="ready"></p></div>
          <div class="body" hidden>
            <span class="mode"></span>
            <p class="paused" hidden>Scanning paused. Return to this tab to resume.</p>
            <h2></h2><p class="detail" hidden></p><p class="reason" hidden></p>
            <ul class="options" aria-label="Switch options"></ul>
          </div>
          <p class="foot"><kbd class="key">Space</kbd> chooses the highlighted option. Nothing is booked or paid without your press.</p>
          <div class="live" aria-live="polite" aria-atomic="true"></div>
        </div>
      </section>`;
    const find = (selector: string) => this.shadow.querySelector<HTMLElement>(selector)!;
    this.panel = find(".panel");
    this.idle = find(".idle");
    this.hint = find(".idle .ready");
    this.body = find(".body");
    this.title = find("h2");
    this.detail = find(".detail");
    this.reason = find(".reason");
    this.options = find(".options");
    this.mode = find(".mode");
    this.counts = find(".counts");
    this.live = find(".live");
    this.paused = find(".paused");
    this.keyLabel = find(".foot .key");
    this.start = this.shadow.querySelector<HTMLButtonElement>(".start")!;
    const style = document.createElement("style");
    style.textContent = mapStyles;
    document.head.append(style);
    document.body.append(this.host);
    document.documentElement.classList.add("one-key-docked");
    new ResizeObserver(() => {
      const bounds = this.panel.getBoundingClientRect();
      // A docked side panel reflows the page instead; only a bottom sheet needs space under the page.
      this.host.style.height = bounds.width < innerWidth ? "0px" : `${bounds.height}px`;
    }).observe(this.panel);
  }

  showStart(key: string, ready: boolean): void {
    this.panel.dataset.state = "idle";
    delete this.panel.dataset.tone;
    this.counts.textContent = "";
    this.keyLabel.textContent = key === " " ? "Space" : key;
    this.body.hidden = true;
    this.idle.hidden = false;
    this.start.disabled = !ready;
    this.hint.textContent = ready ? `Press ${key} to start.` : "Waiting for the seat map.";
  }

  show(mode: Mode, title: string, options: readonly ScanOption[], detail = "", reason = "", tone?: "alert"): void {
    this.panel.dataset.state = "running";
    if (tone) this.panel.dataset.tone = tone;
    else delete this.panel.dataset.tone;
    this.idle.hidden = true;
    this.body.hidden = false;
    this.mode.textContent = mode === "one-key" ? "" :
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
      item.removeAttribute("data-counting");
      if (position === index) item.setAttribute("aria-current", "true");
      else item.removeAttribute("aria-current");
    }
  }

  /** Shows how long the highlighted option stays before the scan moves on. */
  countdown(ms: number): void {
    const item = this.options.querySelector<HTMLElement>("[data-active]");
    if (!item) return;
    item.style.setProperty("--dwell", `${ms}ms`);
    item.removeAttribute("data-counting");
    void item.offsetWidth;
    item.setAttribute("data-counting", "");
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
    const panel = this.panel.getBoundingClientRect();
    const docked = panel.width < innerWidth;
    if (bounds.left < 0 || bounds.right > (docked ? panel.left : innerWidth) ||
      bounds.top < 28 || bounds.bottom + 28 > (docked ? innerHeight : panel.top)) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
    }
  }
}
