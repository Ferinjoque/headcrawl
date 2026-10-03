// Puts everything the in-browser analyzer needs into public/pyodide/:
// the Pyodide runtime, the Pyodide packages we use, a few pure Python wheels
// from PyPI, and our own analyzer wheel. Every download is checked against
// a pinned SHA-256 (Pyodide core), the pinned lock file (Pyodide packages) or
// PyPI's published digest (the rest). Serving it ourselves means the
// game loads no third-party code at runtime.
//
// Needs ../analyzer/dist/headcrawl-*.whl first: `cd ../analyzer && uv build --wheel`.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VERSION = "314.0.7";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${VERSION}/full/`;
// Pinned when the version was picked (2026-10-02). The lock file is pinned too,
// and every package hash below comes from it, so the whole chain is fixed.
const CORE = {
  "pyodide.mjs": "6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109",
  "pyodide.asm.mjs": "f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635",
  "pyodide.asm.wasm": "cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6",
  "python_stdlib.zip": "fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a",
  "pyodide-lock.json": "5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010",
};
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
  if (existsSync(path) && sha256(readFileSync(path)) === expected) return;
  const buf = await get(url);
  if (expected && sha256(buf) !== expected) throw new Error(`${name}: checksum mismatch`);
  writeFileSync(path, buf);
  console.log(`  ${name} ${(buf.length / 1024).toFixed(0)} KB`);
}

for (const [name, hash] of Object.entries(CORE)) await save(name, CDN + name, hash);
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
