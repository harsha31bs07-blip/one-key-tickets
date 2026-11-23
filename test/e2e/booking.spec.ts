import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium, expect, test as base } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { demoSeats } from "../../src/demo.ts";
import type { Snapshot } from "../../src/server/contracts.ts";

const extension = fileURLToPath(new URL("../../extension", import.meta.url));
const site = "http://127.0.0.1:5101";
const api = "http://127.0.0.1:5100/api";
const overlay = "#one-key-tickets";

interface Cinema {
  page: Page;
  popup: Page;
}

const test = base.extend<{ cinema: Cinema }>({
  cinema: async ({ request }, use, testInfo) => {
    const reset = await request.post(`${api}/reset`, { data: { scenario: "demo1" } });
    expect(reset.ok()).toBe(true);
    const context = await chromium.launchPersistentContext(testInfo.outputPath("profile"), {
      channel: "chromium",
      headless: true,
      viewport: { width: 1280, height: 850 },
      artifactsDir: testInfo.outputPath("artifacts"),
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      const popup = context.pages()[0] ?? await context.newPage();
      await popup.goto("chrome://extensions/");
      const installed = popup.locator("extensions-item").filter({ hasText: "One-Key Tickets" });
      await expect(installed).toHaveCount(1);
      const id = await installed.evaluate((element) => {
        if ("data" in element) return (element.data as { id: string }).id;
        throw new Error("Chromium did not expose extension details.");
      });
      await popup.goto(`chrome-extension://${id}/popup.html`);
      await expect(popup.getByLabel("Speak scan options")).toBeChecked();
      await popup.getByLabel("Speak scan options").uncheck();
      await popup.getByRole("button", { name: "Save settings" }).click();
      await expect(popup.getByText("Settings saved.")).toBeVisible();
      const page = await context.newPage();
      await page.goto(`${site}/?okDwell=200`);
      await page.bringToFront();
      await expect(page.getByRole("button", { name: "Start One-Key" })).toBeEnabled();
      await use({ page, popup });
    } finally {
      await context.close();
    }
  },
});

async function pick(page: Page, id: string): Promise<void> {
  await page.locator(`${overlay} [data-option="${id}"][data-active]`).waitFor({ timeout: 5000 });
  await page.keyboard.press("Space");
}

async function wheelchairOffer(page: Page): Promise<void> {
  await page.keyboard.press("Space");
  await pick(page, "wheelchairPair");
  for (let question = 0; question < 2; question++) {
    const panel = page.locator(overlay);
    await expect(panel.locator("h2")).toHaveText(/What is your total budget\?|Which part of the cinema\?/);
    const title = await panel.locator("h2").innerText();
    await pick(page, title === "What is your total budget?" ? "50000" : "any");
  }
  await expect(page.locator(`${overlay} .detail`)).toContainText("E13 wheelchair space, E14 companion seat");
  await expect(page.locator('[data-seat-id="E14"]')).toHaveAttribute("data-one-key-offer", "E14 companion");
}

async function snapshot(request: APIRequestContext): Promise<Snapshot> {
  const response = await request.get(`${api}/snapshot`);
  expect(response.ok()).toBe(true);
  return await response.json() as Snapshot;
}

async function rival(request: APIRequestContext, id: string): Promise<void> {
  const { revision } = await snapshot(request);
  const response = await request.post(`${api}/hold`, {
    data: {
      requestId: randomUUID(), offerRevision: revision, seatIds: [id],
      totalPaise: demoSeats().find((seat) => seat.id === id)!.pricePaise,
    },
  });
  expect(response.ok()).toBe(true);
}

async function held(request: APIRequestContext): Promise<string[]> {
  return (await snapshot(request)).seats.filter(({ status }) => status === "held").map(({ id }) => id);
}

async function expectSummary(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/summary\.html\?hold=.+/);
  await expect(page.getByText("Seats held. Demo: no payment is taken.")).toBeVisible();
}

test("wheelchair pair makes a hold through the page", async ({ cinema: { page }, request }) => {
  await wheelchairOffer(page);
  expect(await held(request)).toEqual([]);
  await pick(page, "book");
  await expectSummary(page);
  expect(await held(request)).toEqual(["E13", "E14"]);
});

test("a rival triggers an announcement and the replacement needs fresh consent", async ({ cinema: { page }, request }) => {
  await wheelchairOffer(page);
  await rival(request, "E14");
  await expect(page.locator(`${overlay} h2`)).toHaveText("E14 was just taken.");
  await page.keyboard.press("Space");
  await expect(page.locator(`${overlay} .detail`)).toContainText("C1 wheelchair space, C2 companion seat");
  expect(await held(request)).toEqual(["E14"]);
  await pick(page, "book");
  await expectSummary(page);
  expect(await held(request)).toEqual(["C1", "C2", "E14"]);
});

test("linear comparison selects two targets and stores the completed result", async ({ cinema: { page, popup }, request }) => {
  // Linear scanning visits all 65 controls after each selection. A slower dwell keeps the test's press inside the
  // highlighted window; at 200 ms the press can land on the next item, which is real scanning behaviour.
  test.setTimeout(150_000);
  await page.goto(`${site}/?okDwell=600`);
  await expect(page.getByRole("button", { name: "Start One-Key" })).toBeEnabled();
  await popup.getByLabel("Target seats").fill("A7 A8");
  await page.bringToFront();
  await popup.locator("form#comparison").evaluate((form) => (form as HTMLFormElement).requestSubmit());
  await expect(popup.getByText("Return to the cinema tab to scan.")).toBeVisible();
  await expect(page.locator(overlay).getByText(/Generic scanning, for comparison/)).toBeVisible();
  for (const selector of ['[data-seat-id="A7"]', '[data-seat-id="A8"]', "#continue"]) {
    await page.locator(`${selector}[data-one-key-focus]`).waitFor({ timeout: 60000 });
    await page.keyboard.press("Space");
  }
  await expectSummary(page);
  expect(await held(request)).toEqual(["A7", "A8"]);
  const result = popup.locator("#results article").filter({ hasText: "Linear" });
  await expect(result.getByText("Completed", { exact: true })).toBeVisible();
  await expect(result.getByText("A7, A8", { exact: true })).toBeVisible();
  await expect(result.getByText("Presses").locator("..").locator("dd")).toHaveText("3");
});

test("a repeat keydown cannot choose a highlighted option", async ({ cinema: { page } }) => {
  await page.keyboard.press("Space");
  await page.locator(`${overlay} [data-active]`).waitFor();
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      key: " ", code: "Space", repeat: true, bubbles: true, cancelable: true,
    }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true, cancelable: true }));
  });
  await expect(page.locator(`${overlay} h2`)).toHaveText("Who needs seats?");
  await expect(page.locator(overlay).getByText(/^1 press ·/)).toBeVisible();
});

test("the cap and seat roles hold when there is no replacement", async ({ cinema: { page }, request }) => {
  await wheelchairOffer(page);
  await rival(request, "C2");
  await rival(request, "E14");
  await expect(page.locator(`${overlay} h2`)).toHaveText("No wheelchair space with a companion seat is left up to ₹500.");
  await expect(page.locator(`${overlay} [data-option]`)).toHaveCount(2);
  await expect(page.locator(`${overlay} [data-option="book"]`)).toHaveCount(0);
  await pick(page, "leave");
  await expect(page.getByRole("button", { name: "Start One-Key" })).toBeVisible();
  expect(await held(request)).toEqual(["C2", "E14"]);
});
