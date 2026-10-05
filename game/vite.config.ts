import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths so the built game works from any folder or subpath.
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
      exclude: ["src/**/*.generated.*", "src/main.ts", "src/app.ts", "src/attract.ts", "src/audio/music.ts", "src/render/**", "src/ui/{dom,hud,panel,screens,sheet,bestiary,labpanel,input,log,gallery,sound,pointer,builder,exports,titlemenu,settingsmenu,gif}.ts", "src/watch.ts", "src/audio/director.ts", "src/lite/{worker,client}.ts"],
    },
  },
});
