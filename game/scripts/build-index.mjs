// Writes public/dungeons/index.json from the dungeon files next to it.
// Order follows ORDER, anything else goes after it alphabetically.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../public/dungeons/", import.meta.url));
const ORDER = ["itsdangerous", "flask", "requests", "express", "ky", "gin", "bubbletea", "ripgrep", "jq", "headcrawl"];

const entries = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .map((f) => {
    const spec = JSON.parse(readFileSync(dir + f, "utf8"));
    const slug = f.replace(/\.json$/, "");
    return {
      slug,
      repo: spec.repo.name,
      head: spec.repo.head,
      language: spec.repo.languages[0]?.name ?? "code",
      floors: spec.floors.length,
      rooms: spec.totals.rooms,
      enemies: spec.totals.enemies,
      boss: spec.floors.at(-1).boss.name,
    };
  })
  .sort((a, b) => {
    const ia = ORDER.indexOf(a.slug);
    const ib = ORDER.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.slug.localeCompare(b.slug);
  });

writeFileSync(dir + "index.json", JSON.stringify(entries, null, 2) + "\n");
console.log(`index.json: ${entries.map((e) => e.slug).join(", ")}`);
