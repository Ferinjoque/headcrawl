// Puts everything the in-browser analyzer needs into public/pyodide/:
// the Pyodide runtime, the Pyodide packages we use, a few pure Python wheels
// from PyPI, and our own analyzer wheel. Every download is checked against
// the SHA-256 that Pyodide's lock file or PyPI publishes. Self-hosting means
// the live site loads no third-party code.
//
// Needs ../analyzer/dist/headcrawl-*.whl first: `cd ../analyzer && uv build --wheel`.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = "314.0.7";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
const CORE = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const WANT = ["micropip", "pydantic"];
const PYPI = [
  ["lizard", "1.24.0"],
  ["pathspec", "0.12.1"],
];

const out = fileURLToPath(new URL("../public/pyodide/", import.meta.url));
const dist = fileURLToPath(new URL("../../analyzer/dist/", import.meta.url));
mkdirSync(out, { recursive: true });

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function save(name, url, expected) {
  const path = out + name;
  if (existsSync(path) && (!expected || sha256(readFileSync(path)) === expected)) return;
  const buf = await get(url);
  if (expected && sha256(buf) !== expected) throw new Error(`${name}: checksum mismatch`);
  writeFileSync(path, buf);
  console.log(`  ${name} ${(buf.length / 1024).toFixed(0)} KB`);
}

for (const f of CORE) await save(f, CDN + f);
const lock = JSON.parse(readFileSync(out + "pyodide-lock.json", "utf8"));

const need = new Set();
const visit = (name) => {
  const key = name.toLowerCase().replace(/[_.]/g, "-");
  if (need.has(key)) return;
  const pkg = lock.packages[key];
  if (!pkg) throw new Error(`pyodide has no package ${name}`);
  need.add(key);
  for (const dep of pkg.depends) visit(dep);
};
WANT.forEach(visit);
if (lock.packages.pygments) visit("pygments");
else PYPI.push(["pygments", "2.19.2"]);

for (const key of need) {
  const pkg = lock.packages[key];
  await save(pkg.file_name, CDN + pkg.file_name, pkg.sha_256);
}

const wheels = [];
for (const [name, version] of PYPI) {
  const meta = JSON.parse((await get(`https://pypi.org/pypi/${name}/${version}/json`)).toString());
  const wheel = meta.urls.find((u) => u.packagetype === "bdist_wheel" && /py3-none-any\.whl$/.test(u.filename));
  if (!wheel) throw new Error(`${name} ${version}: no pure Python wheel`);
  await save(wheel.filename, wheel.url, wheel.digests.sha256);
  wheels.push(wheel.filename);
}

const ours = readdirSync(dist).filter((f) => /^headcrawl-.*-py3-none-any\.whl$/.test(f)).sort().at(-1);
if (!ours) throw new Error("build the analyzer wheel first: cd ../analyzer && uv build --wheel");
copyFileSync(dist + ours, out + ours);
wheels.push(ours);

writeFileSync(
  out + "manifest.json",
  JSON.stringify({ pyodide: VERSION, packages: [...need].sort(), wheels }, null, 2) + "\n",
);
console.log(`pyodide ${VERSION}: ${need.size} packages, ${wheels.length} wheels`);
