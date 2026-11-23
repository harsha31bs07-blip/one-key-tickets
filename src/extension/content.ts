import { buildGraph } from "../core/graph.ts";
import { makeOffer, noMatch, offerOptions } from "../core/offer.ts";
import type { Offer } from "../core/offer.ts";
import { candidateId, candidatesFor, rank } from "../core/planner.ts";
import { backOption, nextQuestion, partyQuestion, remainingQuestions } from "../core/questions.ts";
import type { Question, QuestionOption } from "../core/questions.ts";
import { newCounters, nextIndex, scanSpeech, targetPrompt } from "../core/scan.ts";
import type { ScanOption } from "../core/scan.ts";
import { clampDwell, dwellFor } from "../core/timing.ts";
import type { Answers, SeatMap } from "../core/types.ts";
import { actionLabel, actionableElements, sameSeats, showSeats, siteAdapter } from "./adapter.ts";
import type { SiteAdapter } from "./adapter.ts";
import { switchInput } from "./input.ts";
import { Overlay } from "./overlay.ts";
import { isComparison, readSettings, resultPrefix, settingsKey } from "./settings.ts";
import type { Mode, RunResult, Settings } from "./settings.ts";
import { browserSpeaker } from "./speaker.ts";

const pendingKey = "one-key-pending-hold";

interface PendingHold {
  key: string;
  result: RunResult;
  target: string[];
  startedAt: number;
}

interface Scene {
  title: string;
  options?: readonly ScanOption[];
  detail?: string;
  reason?: string;
  intro?: string;
  noticeMs?: number;
  afterIntro?: () => void;
  choose?: (option: ScanOption) => void;
  highlight?: (index: number) => void;
}

function mount(adapter: SiteAdapter, initialSettings: Settings): void {
  const overlay = new Overlay();
  let settings = initialSettings;
  const speaker = browserSpeaker(() => settings.speech);
  const override = new URLSearchParams(location.search).get("okDwell");
  const testDwell = override?.trim() && Number.isFinite(Number(override)) ? clampDwell(Number(override), 100) : undefined;
  let dwell = testDwell ?? settings.dwellMs;
  let current: { key: string; result: RunResult; target: string[] } | undefined;
  let clockStart: number | undefined;
  let focus = document.hasFocus() && !document.hidden;
  let scene: Scene | undefined;
  let index = 0;
  let active = -1;
  let animation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let answers: Answers = {};
  let history: { question: Question; option: QuestionOption }[] = [];
  let offeredHelp = false;
  let offer: Offer | undefined;
  let pending = false;
  let genericGroup: string | undefined;
  let genericFocus: HTMLElement[] = [];
  let seenRevision = adapter.read()?.revision;

  function elapsed(): number {
    return (current?.result.elapsedMs ?? 0) +
      (clockStart === undefined ? 0 : Math.round(performance.now() - clockStart));
  }

  function renderCounters(): void {
    if (current) overlay.update({ ...current.result, elapsedMs: elapsed() });
  }

  function persist(): void {
    if (current) {
      void chrome.storage.local.set({ [current.key]: { ...current.result, elapsedMs: elapsed() } });
    }
  }

  function halt(): void {
    animation++;
    active = -1;
    clearTimeout(timer);
    overlay.highlight(-1);
    speaker.cancel();
    setGenericFocus([]);
  }

  function say(text: string): Promise<void> {
    overlay.caption(text);
    return speaker.speak(text);
  }

  async function scan(): Promise<void> {
    const shown = scene;
    if (!shown || !focus || !current) return;
    const version = ++animation;
    if (shown.intro) {
      await say(shown.intro);
      if (version !== animation) return;
      if (shown.noticeMs) {
        timer = setTimeout(() => {
          shown.intro = undefined;
          shown.afterIntro?.();
        }, shown.noticeMs);
        return;
      }
      shown.intro = undefined;
      if (shown.afterIntro) {
        shown.afterIntro();
        return;
      }
    }
    const options = shown.options;
    const option = options?.[index];
    if (!option || !options) return;
    active = index;
    if (shown.highlight) {
      shown.highlight(index);
      overlay.setOptions([option]);
    }
    overlay.highlight(shown.highlight ? 0 : index);
    current.result.scanWindows++;
    renderCounters();
    persist();
    await say(scanSpeech(option));
    if (version !== animation) return;
    timer = setTimeout(() => {
      index = nextIndex(index, options.length);
      void scan();
    }, dwellFor(index, dwell));
  }

  function display(next: Scene): void {
    if (!current) return;
    halt();
    scene = next;
    index = 0;
    overlay.show(current.result.mode, next.title, next.highlight ? [] : next.options ?? [], next.detail, next.reason);
    renderCounters();
    persist();
    void scan();
  }

  function idle(): void {
    overlay.showStart(settings.key, !!adapter.read());
  }

  function finish(): void {
    persist();
    current = undefined;
    clockStart = undefined;
    scene = undefined;
    offer = undefined;
    halt();
    input.discard();
    showSeats(adapter, []);
    idle();
  }

  function start(mode: Mode, switchPress: boolean, target: string[] = []): void {
    if (!adapter.read() || pending) return;
    if (current) finish();
    dwell = testDwell ?? settings.dwellMs;
    answers = {};
    history = [];
    offeredHelp = false;
    genericGroup = undefined;
    current = {
      key: `${resultPrefix}${Date.now()}:${crypto.randomUUID()}`,
      target,
      result: {
        ...newCounters(), mode,
        task: target.length ? targetPrompt(target) : "Book cinema seats",
        presses: Number(switchPress), seats: [], totalPaise: 0,
      },
    };
    clockStart = focus ? performance.now() : undefined;
    overlay.pause(!focus);
    if (mode === "one-key") ask();
    else generic(true);
  }

  function plan(map: SeatMap) {
    return answers.party === undefined ? [] : candidatesFor(buildGraph(map.seats), answers.party);
  }

  function ask(previous?: Question): void {
    const map = adapter.read();
    if (!map || !current) return;
    current.result.task = history.map(({ option }) => option.label).join(" · ") || "Book cinema seats";
    const candidates = plan(map);
    const question = previous?.id === "party" ? partyQuestion :
      remainingQuestions(candidates, answers).find((item) => item.id === previous?.id) ??
      nextQuestion(candidates, answers, dwell);
    if (!question) return present();
    display({
      title: question.prompt,
      intro: question.prompt,
      options: question.id === "party" ? question.options : [...question.options, backOption],
      choose(option) {
        if (option.id === backOption.id) {
          const last = history.pop();
          if (!last || !current) return;
          delete answers[last.question.id];
          current.result.corrections++;
          if (current.result.corrections === 2 && settings.adaptive && !offeredHelp) {
            offeredHelp = true;
            display({
              title: "More time?",
              intro: "More time?",
              options: [{ id: "more", label: "Yes, more time" }, { id: "same", label: "Keep current speed" }],
              choose(choice) {
                if (choice.id === "more") dwell = clampDwell(dwell * 1.25, testDwell ? 100 : 500);
                ask(last.question);
              },
            });
            return;
          }
          ask(last.question);
          return;
        }
        const answer = question.options.find((choice) => choice.id === option.id);
        if (!answer) return;
        answers = { ...answers, [question.id]: answer.value };
        history.push({ question, option: answer });
        ask();
      },
    });
  }

  function present(after?: string): void {
    const map = adapter.read();
    if (!map) return;
    const choices = rank(plan(map), answers);
    const previous = after ? choices.findIndex((candidate) => candidateId(candidate) === after) : -1;
    const candidate = choices.length ? choices[nextIndex(previous, choices.length)] : undefined;
    offer = candidate ? makeOffer(candidate, map.revision, answers) : undefined;
    showSeats(adapter, offer?.seats ?? []);
    const shown = offer;
    if (shown) {
      requestAnimationFrame(() => {
        const first = adapter.seatButton(shown.seats[0].id);
        if (first && offer === shown && focus) overlay.reveal(first);
      });
    }
    const message = shown?.readBack ?? noMatch(answers);
    const onlyChoice = !!(shown && after && choices.length === 1);
    const reason = onlyChoice ? `This is the only matching option. ${shown.reason}` : shown?.reason;
    display({
      title: shown ? "Your seat offer" : message,
      detail: shown ? message : undefined,
      reason,
      intro: onlyChoice ? `This is the only matching option. ${message}` : message,
      options: shown ? offerOptions : offerOptions.slice(2),
      choose(option) {
        if (option.id === "leave") finish();
        if (option.id === "change") {
          offer = undefined;
          answers = {};
          history = [];
          showSeats(adapter, []);
          ask();
        }
        if (option.id === "next" && candidate) present(candidateId(candidate));
        if (option.id === "book" && shown && offer === shown) book(shown);
      },
    });
  }

  function changedSeats(shown: Offer, map: SeatMap, touched: readonly string[] = []): string[] {
    return shown.seats.filter((seat) => {
      const live = map.seats.find(({ id }) => id === seat.id);
      return touched.includes(seat.id) || !live || live.status !== "available" || live.pricePaise !== seat.pricePaise ||
        live.role !== seat.role || live.companionOf !== seat.companionOf || live.row !== seat.row ||
        live.zone !== seat.zone || live.block !== seat.block || live.number !== seat.number;
    }).map(({ id }) => id);
  }

  function stale(changed: readonly string[], message?: string): void {
    const map = adapter.read();
    const taken = changed.filter((id) => map?.seats.find((seat) => seat.id === id)?.status !== "available");
    const notice = message ?? (taken.length ? `${taken.join(" and ")} ${taken.length === 1 ? "was" : "were"} just taken.` :
      changed.length ? `Availability changed for ${changed.join(" and ")}.` : "The seat map changed.");
    offer = undefined;
    input.discard();
    showSeats(adapter, []);
    display({
      title: notice,
      intro: notice,
      noticeMs: Math.max(dwell, 600),
      afterIntro: () => current?.result.mode === "one-key" ? present() : generic(),
    });
  }

  function submit(): void {
    if (!current || pending || adapter.continueButton.disabled) return;
    const selection = adapter.selection();
    if (!selection.seats.length) return;
    Object.assign(current.result, selection);
    const saving: PendingHold = {
      key: current.key,
      result: { ...current.result, elapsedMs: elapsed() },
      target: current.target,
      startedAt: Date.now(),
    };
    sessionStorage.setItem(pendingKey, JSON.stringify(saving));
    pending = true;
    display({ title: "Checking seat availability…", intro: "Checking seat availability." });
    adapter.continueButton.click();
    if (adapter.map.dataset.booking !== "pending") {
      pending = false;
      sessionStorage.removeItem(pendingKey);
      Object.assign(current.result, { seats: [], totalPaise: 0 });
      stale([], "The cinema could not start the hold.");
    }
  }

  function book(shown: Offer): void {
    if (adapter.continueButton.disabled) return stale([], "The cinema is already checking a hold.");
    const map = adapter.read();
    if (!map) return stale([]);
    const changed = changedSeats(shown, map);
    if (changed.length) return stale(changed);
    const wanted = shown.seats.map(({ id }) => id);
    const before = adapter.selection().seats;
    for (const id of before.filter((id) => !wanted.includes(id))) adapter.seatButton(id)?.click();
    for (const id of wanted.filter((id) => !before.includes(id))) adapter.seatButton(id)?.click();
    const selected = adapter.selection();
    const latest = adapter.read();
    if (!latest || latest.revision !== map.revision || adapter.continueButton.disabled ||
      !sameSeats(selected.seats, wanted) ||
      selected.totalPaise !== shown.totalPaise) {
      for (const id of selected.seats) adapter.seatButton(id)?.click();
      return stale(latest ? changedSeats(shown, latest) : []);
    }
    submit();
  }

  function setGenericFocus(elements: HTMLElement[]): void {
    for (const element of genericFocus) delete element.dataset.oneKeyFocus;
    genericFocus = elements;
    for (const element of elements) element.dataset.oneKeyFocus = "";
    if (elements[0]) overlay.reveal(elements[0]);
  }

  function generic(introduce = false): void {
    if (!current) return;
    const elements = actionableElements();
    const task = current.result.task;
    const groups = new Map<string, { label: string; targets: HTMLElement[]; items: HTMLElement[] }>();
    const rowColumn = current.result.mode === "row-column";
    if (rowColumn) {
      for (const element of elements) {
        const row = element.closest<HTMLElement>(".row[data-row]");
        const label = row ? `Row ${row.dataset.row}` : "Other controls";
        const group = groups.get(label) ?? { label, targets: row ? [row] : [], items: [] };
        group.items.push(element);
        if (!row) group.targets.push(element);
        groups.set(label, group);
      }
    }
    const group = genericGroup ? groups.get(genericGroup) : undefined;
    const inGroups = rowColumn && !group;
    const entries = inGroups ? [...groups.values()] : (group?.items ?? elements).map((element) =>
      ({ label: actionLabel(element), targets: [element], items: [element] })
    );
    const options = entries.map(({ label }, position) => ({ id: String(position), label }));
    const title = inGroups ? "Scan rows and controls" : group?.label ?? "Scan page controls";
    display({
      title,
      detail: task,
      intro: introduce ? task : undefined,
      options,
      highlight: (position) => setGenericFocus(entries[position].targets),
      choose(option) {
        const entry = entries[Number(option.id)];
        if (inGroups) {
          genericGroup = entry.label;
          generic();
          return;
        }
        const element = entry.items[0];
        genericGroup = undefined;
        if (element === adapter.continueButton && adapter.selection().seats.length && !adapter.continueButton.disabled) {
          submit();
          return;
        }
        element.click();
        generic();
      },
    });
  }

  const consume = () => {};
  const input = switchInput(() => settings.key, (event) => {
    if (current) {
      const shown = scene;
      const option = shown?.options?.[active];
      if (!focus || !shown || !option || !shown.choose) return consume;
      return () => {
        if (!current || !focus || shown !== scene) return;
        current.result.presses++;
        shown.choose?.(option);
      };
    }
    const interactive = event.composedPath().some((element) => element instanceof HTMLElement &&
      element !== overlay.start && element.matches("button, a[href], input, select, textarea, [contenteditable]"));
    if (!adapter.read() || interactive || !focus) return;
    return () => start("one-key", true);
  });
  overlay.start.addEventListener("click", () => start("one-key", false));

  function syncFocus(focused: boolean): void {
    if (focused === focus) return;
    focus = focused;
    input.discard();
    overlay.pause(!focus);
    if (!current) return;
    if (!focus) {
      current.result.elapsedMs = elapsed();
      clockStart = undefined;
      halt();
      persist();
    } else {
      clockStart = performance.now();
      void scan();
    }
    renderCounters();
  }

  window.addEventListener("focus", () => syncFocus(!document.hidden));
  window.addEventListener("blur", () => syncFocus(false));
  document.addEventListener("visibilitychange", () => syncFocus(document.hasFocus() && !document.hidden));
  window.addEventListener("pagehide", () => { if (!pending) persist(); });
  setInterval(renderCounters, 250);

  adapter.observe((touched) => {
    const map = adapter.read();
    if (!map) return;
    const revisionChanged = map.revision !== seenRevision;
    seenRevision = map.revision;
    if (!current) return idle();
    if (pending) {
      const booking = adapter.map.dataset.booking;
      if (booking === "stale" || booking === "error") {
        pending = false;
        sessionStorage.removeItem(pendingKey);
        Object.assign(current.result, { seats: [], totalPaise: 0 });
        const changed = JSON.parse(adapter.map.dataset.changedSeats ?? "[]") as string[];
        stale(changed, booking === "error" ? "The cinema could not confirm the hold." : undefined);
      }
    } else if (offer) {
      const changed = changedSeats(offer, map, touched);
      if (changed.length) stale(changed);
    } else if (current.result.mode !== "one-key" && revisionChanged && !scene?.afterIntro) {
      generic();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(settingsKey in changes)) return;
    input.discard();
    settings = readSettings(changes[settingsKey].newValue);
    if (!current) idle();
  });

  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (!isComparison(message)) return;
    const map = adapter.read();
    if (!map || pending) return reply({ error: "Wait for the seat map to finish updating." });
    if (!message.target.every((id) => map.seats.some((seat) => seat.id === id && seat.status === "available"))) {
      return reply({ error: "Choose two different available seats." });
    }
    if (adapter.selection().seats.length) {
      return reply({ error: "Clear the current seat selection first." });
    }
    start(message.mode, false, message.target);
    reply({ ok: true });
  });
  idle();
}

async function completeFromSummary(summary: HTMLElement): Promise<void> {
  const raw = sessionStorage.getItem(pendingKey);
  if (!raw || !summary.dataset.holdId) return;
  const pending = JSON.parse(raw) as PendingHold;
  const seats = JSON.parse(summary.dataset.seats ?? "[]") as string[];
  const result: RunResult = {
    ...pending.result, seats, totalPaise: Number(summary.dataset.totalPaise),
    elapsedMs: pending.result.elapsedMs + Math.max(0, Date.now() - pending.startedAt),
    completed: sameSeats(seats, pending.target.length ? pending.target : pending.result.seats),
  };
  await chrome.storage.local.set({ [pending.key]: result });
  sessionStorage.removeItem(pendingKey);
}

const demoPort = location.port === "5101" || location.port === "5102";
const adapter = demoPort ? siteAdapter() : undefined;
const summary = demoPort ? document.querySelector<HTMLElement>("#hold-summary") : null;
if (adapter) {
  sessionStorage.removeItem(pendingKey);
  void chrome.storage.local.get(settingsKey).then((values) => mount(adapter, readSettings(values[settingsKey])));
} else if (summary) {
  if (summary.dataset.holdId) void completeFromSummary(summary);
  else {
    const observer = new MutationObserver(() => {
      if (!summary.dataset.holdId) return;
      observer.disconnect();
      void completeFromSummary(summary);
    });
    observer.observe(summary, { attributes: true, attributeFilter: ["data-hold-id"] });
  }
}
