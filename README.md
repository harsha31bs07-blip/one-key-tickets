# One-Key Tickets

One-Key Tickets is an offline Chrome extension for booking cinema seats with one switch, set to Space by default.
It can hold a wheelchair space and its designated companion seat together on a live seat map.

A cinema map expects someone to point at individual seats, recognize availability, and work around aisles. A person using one switch may have to scan seat by seat, then start again if a seat is taken before they can confirm.

## How it works

The extension reads the rendered page into a seat graph. Neighbors must be consecutive seats in the same row and block. Wheelchair spaces use the page’s explicit companion links. After asking about party size, it asks the remaining question most likely to change the offer per second of scanning. It stops asking when the remaining answers would lead to the same offer.

Options are highlighted and spoken in order. The dwell period starts after speech. Press the switch to choose the highlighted option. The extension reads back an offer, marks its seats on the original map, and waits for **Book these**. The page’s own controls place the hold.

Party and total budget are hard limits. Zone and aisle answers rank matching seats. If an offered seat becomes unavailable, the extension announces the change, keeps the answers, and looks for another matching offer. The replacement requires a fresh press. It never substitutes an ordinary seat for a companion, splits a wheelchair pair, raises the cap, or takes payment.

## Quick start

Use Node.js 22.18 or newer and Chrome with unpacked extensions enabled.

1. Run `npm i` if the project dependencies are absent.
2. Run `npm run build` and then `npm start`.
3. Open `chrome://extensions`, enable **Developer mode**, and load the unpacked `extension/` directory.
4. Open [the local seat map](http://127.0.0.1:5101). Press Space or use **Start One-Key**.

The popup lets a helper set the switch key, set the dwell from 500 to 4,000 ms, toggle speech and adaptive help, start a comparison run, and view or reset the last five results. After two uses of **Back**, adaptive help offers a 25% longer dwell. Scanning pauses when the tab loses focus. Speech uses local browser voices, with on-screen captions and estimated speech timing if no local voice is installed.

The test-only `?okDwell=200` URL parameter overrides dwell for that page. The override is clamped to 100–4,000 ms. The standard dwell is 1,500 ms, with 50% extra for the first option in each scan.

## Demo the inventory change

1. In a second terminal, run `npm run reset`.
2. Start One-Key and choose **Wheelchair space + companion seat**, then **Up to ₹500 total**. Choose **No preference** when asked about zone.
3. Wait for **E13 + E14**, a wheelchair space and its companion in the middle for ₹440. Leave the offer open.
4. In the second terminal run `npm run rival -- E14`. This uses the same hold API as the cinema page. You can also select E14 and continue in a second window.
5. Listen for **E14 was just taken.** The replacement is **C1 + C2**, in front for ₹300. The back pair costs ₹640 and falls outside the cap.
6. Press on **Book these**. The summary confirms the hold with no payment. Run `npm run reset` before repeating the demo.

## Comparison

The popup’s **Generic scanning, for comparison** modes start with two target seat IDs provided by a helper. Linear scanning visits every enabled actionable control in DOM order. Row-column scanning visits each seat row and a group for other controls. A press enters the highlighted group, and a second press activates a control within it. After an activation, both modes restart at the first control or group. Both use the same switch, speech, and dwell timing as One-Key.

`npm run compare` simulates immediate first-pass choices on the seeded fixture. Generic modes receive the exact seats the One-Key planner offers for each task. One-Key counts its start press, and the generic runs begin after helper setup. The model includes estimated speech and the time spent passing other options. It assumes fixed inventory and excludes reaction time, errors, retries, and the hold round trip. It measures this fixture and scan order, with no claim about user performance or other scanners.

## What runs locally

Orion Talkies, Screen 2 is a fictional demo cinema. The map, inventory changes, atomic holds, switch input, and browser extension run locally. The cinema page talks to the inventory API on port 5100. The extension reads and operates the page on port 5101 through rendered controls. Its only extension permission is local storage. Holds are in memory and persist until a reset or server restart.

`npm run typecheck`, `npm test`, and `npm run e2e` check types, pure logic and inventory, and the unpacked extension in Playwright Chromium. The browser suite uses the prepared local Chromium installation.

## Roadmap

- Add a second cinema site with an SVG map.
- Add an offline ElevenLabs phrase bank in English, Hindi, and Kannada.
- Explore a read-only Bedrock preview for unfamiliar map images.
- Apply one-switch goal-level scanning to other tasks.
