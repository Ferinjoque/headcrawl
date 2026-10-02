import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths so the build works under any GitHub Pages subpath.
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
  },
  test: {
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.generated.*", "src/main.ts", "src/app.ts", "src/render/**", "src/ui/{dom,hud,panel,screens,input,log,gallery}.ts"],
    },
  },
});
