import { fixture } from "../src/demo.ts";

const response = await fetch("http://127.0.0.1:5100/api/reset", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ scenario: fixture.scenario }),
});
if (!response.ok) throw new Error(`Reset failed (${response.status}): ${await response.text()}`);
console.log(`Reset ${fixture.scenario} inventory.`);
