// Writes public/dungeons/index.json from the dungeon files next to it.
// Order follows ORDER, anything else goes after it alphabetically.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../public/dungeons/", import.meta.url));
const ORDER = ["itsdangerous", "flask", "requests", "express", "ky", "gin", "bubbletea", "ripgrep", "jq", "jsoup", "mediatr", "alamofire", "slim", "sinatra", "moshi", "headcrawl"];

// Rough danger per dungeon: how much hurt the average monster can do, how
// tough the bosses are, and how far down you have to go.
function threat(spec) {
  const enemies = spec.floors.flatMap((f) => f.rooms.flatMap((r) => r.enemies));
  const avg = enemies.reduce((s, e) => s + e.hp * e.damage, 0) / Math.max(1, enemies.length);
  const bosses = spec.floors.reduce((s, f) => s + f.boss.hp * f.boss.damage, 0) / spec.floors.length;
  return avg * 0.6 + bosses * 0.02 + spec.floors.length * 4;
}

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
      threat: threat(spec),
    };
  })
  .sort((a, b) => {
    const ia = ORDER.indexOf(a.slug);
    const ib = ORDER.indexOf(b.slug);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.slug.localeCompare(b.slug);
  });

// Difficulty 1-5 by rank within the gallery, so it stays meaningful as repos come and go.
const ranked = [...entries].sort((a, b) => a.threat - b.threat);
for (const e of entries) {
  e.difficulty = 1 + Math.floor((ranked.indexOf(e) / Math.max(1, entries.length)) * 5);
  delete e.threat;
}

writeFileSync(dir + "index.json", JSON.stringify(entries, null, 2) + "\n");
console.log(`index.json: ${entries.map((e) => `${e.slug}:${e.difficulty}`).join(", ")}`);
