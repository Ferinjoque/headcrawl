import { defineConfig } from "vitest/config";

// npm run sim: bot runs over the gallery, for balance work. Not part of npm test.
export default defineConfig({
  test: {
    include: ["sim/**/*.sim.ts"],
    testTimeout: 30 * 60 * 1000,
  },
});
