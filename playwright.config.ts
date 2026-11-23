import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/e2e",
  workers: 1,
  timeout: 45000,
  reporter: "list",
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:5101/",
    reuseExistingServer: true,
    timeout: 10000,
  },
});
