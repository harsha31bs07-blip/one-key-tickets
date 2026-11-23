import { normalizeKey } from "./settings.ts";

export function switchInput(
  key: () => string,
  armPress: (event: KeyboardEvent) => (() => void) | undefined,
): { discard(): void } {
  let down = false;
  let commit: (() => void) | undefined;
  const discard = () => {
    down = false;
    commit = undefined;
  };
  const capture = (event: KeyboardEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const isSwitch = (event: KeyboardEvent) =>
    !!event.key && normalizeKey(event.key).toLowerCase() === key().toLowerCase();
  window.addEventListener("keydown", (event) => {
    if (!isSwitch(event)) return;
    if (event.repeat) {
      if (down || armPress(event)) capture(event);
      return;
    }
    const action = armPress(event);
    if (!action) return;
    capture(event);
    if (down) return;
    down = true;
    commit = action;
  }, true);
  window.addEventListener("keyup", (event) => {
    if (!down || !isSwitch(event)) return;
    capture(event);
    const action = commit;
    discard();
    action?.();
  }, true);
  return { discard };
}
