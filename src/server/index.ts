import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { demoSeats, fixture } from "../demo.ts";
import type { HoldRequest } from "./contracts.ts";
import { Inventory } from "./inventory.ts";

const inventory = new Inventory(demoSeats());
const listeners = new Set<ServerResponse>();
const allowedOrigins = new Set(["127.0.0.1", "localhost"]
  .flatMap((host) => [5101, 5102].map((port) => `http://${host}:${port}`)));

function json(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function event(): string {
  return `data: ${JSON.stringify(inventory.snapshot())}\n\n`;
}

function publish(): void {
  const message = event();
  for (const listener of listeners) listener.write(message);
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  request.setEncoding("utf8");
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16384) throw new Error("Request body too large");
  }
  return JSON.parse(body);
}

function isHoldRequest(body: unknown): body is HoldRequest {
  if (!body || typeof body !== "object") return false;
  const value = body as Partial<HoldRequest>;
  return typeof value.requestId === "string" && value.requestId.length > 0 &&
    typeof value.offerRevision === "number" && Number.isSafeInteger(value.offerRevision) &&
    value.offerRevision >= 0 && value.offerRevision <= inventory.snapshot().revision &&
    Array.isArray(value.seatIds) && value.seatIds.every((id: unknown) => typeof id === "string") &&
    Number.isSafeInteger(value.totalPaise);
}

async function api(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const origin = request.headers.origin;
  if (origin) {
    if (!allowedOrigins.has(origin)) return json(response, 403, { reason: "origin-not-allowed" });
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return response.end();
  }
  if (request.method === "GET" && request.url === "/api/snapshot") {
    return json(response, 200, inventory.snapshot());
  }
  if (request.method === "GET" && request.url === "/api/events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    listeners.add(response);
    response.on("close", () => listeners.delete(response));
    response.write(event());
    return;
  }
  if (request.method === "POST" && request.url === "/api/hold") {
    const body = await requestBody(request);
    if (!isHoldRequest(body)) return json(response, 400, { reason: "invalid-request" });
    const previous = inventory.snapshot().revision;
    const result = inventory.hold(body);
    json(response, result.status, result.body);
    if (inventory.snapshot().revision !== previous) publish();
    return;
  }
  if (request.method === "POST" && request.url === "/api/reset") {
    const body = await requestBody(request);
    if (!body || typeof body !== "object" || !("scenario" in body) || body.scenario !== fixture.scenario) {
      return json(response, 400, { reason: "unknown-scenario" });
    }
    inventory.reset(demoSeats());
    json(response, 200, inventory.snapshot());
    publish();
    return;
  }
  json(response, 404, { reason: "not-found" });
}

const routes = new Map([
  ["/", ["../sites/a/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["../sites/a/index.html", "text/html; charset=utf-8"]],
  ["/summary.html", ["../sites/a/summary.html", "text/html; charset=utf-8"]],
  ["/styles.css", ["../sites/a/styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["../sites/a/dist/app.js", "text/javascript; charset=utf-8"]],
]);

createServer((request, response) => {
  void api(request, response).catch(() => json(response, 400, { reason: "invalid-request" }));
}).listen(5100, "127.0.0.1", () => console.log("Inventory API at http://127.0.0.1:5100"));

createServer((request, response) => {
  const route = routes.get((request.url ?? "/").split("?")[0]);
  if (!route || request.method !== "GET") return json(response, 404, { reason: "not-found" });
  try {
    const body = readFileSync(new URL(route[0], import.meta.url), "utf8");
    response.writeHead(200, { "Content-Type": route[1], "Cache-Control": "no-store" });
    response.end(body);
  } catch {
    json(response, 503, { reason: "site-build-missing", instruction: "Run npm run build." });
  }
}).listen(5101, "127.0.0.1", () => console.log("Orion Talkies (fictional demo cinema) at http://127.0.0.1:5101"));
