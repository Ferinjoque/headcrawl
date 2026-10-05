import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:4179/",
    viewport: { width: 1280, height: 800 },
    // Past the welcome card, which only shows once per browser.
    storageState: "e2e/state.json",
  },
  webServer: {
    command: "npx vite preview --port 4179 --strictPort",
    url: "http://localhost:4179/",
    reuseExistingServer: !process.env.CI,
  },
});
