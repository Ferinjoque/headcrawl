import "@fontsource/vt323";
import "./ui/style.css";
import { App } from "./app";

const app = new App();
void app.start();

// Lets scripts/shots.mjs poke at the game in dev. Stripped from builds.
if (import.meta.env.DEV) (window as unknown as { headcrawl: App }).headcrawl = app;
