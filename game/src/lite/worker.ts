/// <reference lib="webworker" />
// Runs the real Python analyzer in the browser with Pyodide, on a background
// thread. Files come straight from GitHub: the tree API for the list, raw
// downloads for the contents. Nothing in the repo is ever executed; Python
// only reads the text, same as the command line tool.

import { BLAME_BATCH, blameQuery, blameYears, type LineBlame } from "./blame";
import { safePath, validRef, validToken, type LocalRequest, type WorkerReply, type WorkerRequest } from "./protocol";

interface PyProxy {
  callKwargs(...args: unknown[]): Promise<unknown>;
  destroy?(): void;
}

interface Pyodide {
  loadPackage(names: string[]): Promise<void>;
  pyimport(name: string): Record<string, PyProxy & ((...args: unknown[]) => unknown)>;
  FS: {
    mkdirTree(path: string): void;
    writeFile(path: string, data: Uint8Array): void;
    rmdir(path: string): void;
    analyzePath(path: string): { exists: boolean };
  };
  runPython(code: string): unknown;
}

interface Manifest {
  pyodide: string;
  packages: string[];
  wheels: string[];
}

declare const self: DedicatedWorkerGlobalScope;

let ready: Promise<Pyodide> | null = null;
let runs = 0;

function say(msg: WorkerReply): void {
  self.postMessage(msg);
}

async function boot(base: string): Promise<Pyodide> {
  const index = new URL("pyodide/", base).href;
  const res = await fetch(index + "manifest.json");
  if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
    throw new GitHubError("Building repos here needs a one-time setup: run `npm run py` in the game folder (needs uv), then reload.");
  }
  const manifest = (await res.json()) as Manifest;
  say({ type: "progress", text: "Starting Python (about 4 MB the first time)" });
  const mod = (await import(/* @vite-ignore */ index + "pyodide.mjs")) as {
    loadPyodide(opts: { indexURL: string }): Promise<Pyodide>;
  };
  const py = await mod.loadPyodide({ indexURL: index });
  say({ type: "progress", text: "Loading the analyzer" });
  await py.loadPackage(manifest.packages);
  const micropip = py.pyimport("micropip");
  await micropip.install.callKwargs(
    manifest.wheels.map((w) => index + w),
    { deps: false },
  );
  return py;
}

class GitHubError extends Error {}

/** The player's GitHub token for this request, if they gave one. Only ever sent to api.github.com. */
let token: string | null = null;

function minutesUntil(res: Response): number {
  const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
  return reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : 60;
}

async function gh(url: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token && url.startsWith("https://api.github.com/")) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000), headers });
  if (res.status === 401) throw new GitHubError("GitHub refused that token. Check it in settings, or remove it.");
  if (res.status === 403 || res.status === 429) {
    throw new GitHubError(`GitHub's hourly limit is used up. Try again in ${minutesUntil(res)} minutes, or add a token in settings.`);
  }
  if (res.status === 404) throw new GitHubError("That repo doesn't exist, or it's private.");
  if (!res.ok) throw new GitHubError(`GitHub answered ${res.status}.`);
  // GraphQL has its own points budget; only the REST one matters for history.
  const left = Number(res.headers.get("x-ratelimit-remaining"));
  if (Number.isFinite(left) && !url.endsWith("/graphql")) remaining = left;
  return res;
}

/** GitHub's allowance left this hour, from the last answer: 60 without a token, 5000 with one. */
let remaining = 60;
// Calls kept back so the next repo someone types can still be built.
const KEEP_FOR_NEXT = 6;

interface History {
  counts: Record<string, number>;
  subjects: Record<string, string>;
}

/**
 * How many of the last 100 commits touched each file, and the subject of the
 * newest one. All or nothing: a partial answer would make the same link
 * build a different dungeon for someone else, so a short budget is an error.
 */
async function history(api: string, sha: string, paths: string[]): Promise<History> {
  if (remaining - KEEP_FOR_NEXT < paths.length) {
    throw new GitHubError(
      `Building this repo needs ${paths.length} more GitHub calls and the hourly allowance is nearly used up. ` +
        "Try again later, or add a token in settings.",
    );
  }
  const out: History = { counts: {}, subjects: {} };
  for (const path of paths) {
    const res = await gh(`${api}/commits?sha=${sha}&per_page=100&path=${encodeURIComponent(path)}`);
    const commits = (await res.json()) as { commit?: { message?: string } }[];
    out.counts[path] = commits.length;
    const message = commits[0]?.commit?.message;
    if (typeof message === "string") out.subjects[path] = message;
  }
  return out;
}

/**
 * Year each loot line was last changed, from GitHub's blame. Needs a token:
 * GitHub's GraphQL API has no anonymous access.
 */
async function blame(owner: string, repo: string, sha: string, lines: Record<string, number[]>): Promise<Record<string, Record<string, LineBlame>>> {
  const out: Record<string, Record<string, LineBlame>> = {};
  const files = Object.keys(lines).slice(0, 40);
  for (let i = 0; i < files.length; i += BLAME_BATCH) {
    const batch = files.slice(i, i + BLAME_BATCH);
    const res = await gh("https://api.github.com/graphql", { method: "POST", body: JSON.stringify(blameQuery(owner, repo, sha, batch)) });
    Object.assign(out, blameYears(await res.json(), batch, lines));
  }
  return out;
}

interface TreeEntry {
  path: string;
  type: string;
  mode: string;
  size?: number;
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++]);
  });
  await Promise.all(runners);
}

function python(base: string): Promise<Pyodide> {
  // A failed boot (say, a network blip) must not poison every later try.
  ready ??= boot(base).catch((err: unknown) => {
    ready = null;
    throw err;
  });
  return ready;
}

/** A folder from the player's disk: Python picks the files, only those get read. */
async function analyzeLocal(req: LocalRequest): Promise<string> {
  const py = await python(req.base);
  const web = py.pyimport("headcrawl.web");
  // A folder full of node_modules can hold millions of entries; Python only reads a few hundred anyway.
  const files = req.files.slice(0, 50_000).filter((f) => safePath(f.path));
  const listing = files.map((f) => ({ path: f.path, size: f.file.size }));
  const chosen = JSON.parse(String(web.choose_all(JSON.stringify(listing)))) as { paths: string[]; complete: boolean };
  const picked = new Set(chosen.paths);
  if (!picked.size) throw new GitHubError("No source files I can read in that folder.");
  const root = `/local${++runs}`;
  let done = 0;
  for (const f of files) {
    if (!picked.has(f.path)) continue;
    const full = `${root}/${f.path}`;
    try {
      py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
      py.FS.writeFile(full, new Uint8Array(await f.file.arrayBuffer()));
    } catch {
      continue; // unreadable, or a file where a folder should be: skip it
    }
    if (++done % 50 === 0) say({ type: "progress", text: `Read ${done} of ${picked.size} files` });
  }
  say({ type: "progress", text: "Turning the code into a dungeon" });
  try {
    return String(web.local_dungeon(root, req.name, chosen.complete && files.length === req.files.length));
  } finally {
    py.runPython(`import shutil; shutil.rmtree(${JSON.stringify(root)}, ignore_errors=True)`);
  }
}

async function analyze(base: string, owner: string, repo: string, sha?: string): Promise<string> {
  const py = await python(base);

  say({ type: "progress", text: `Asking GitHub about ${owner}/${repo}` });
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const meta = (await (await gh(api)).json()) as { default_branch: string; full_name: string; private: boolean };
  const ref = sha && validRef(sha) ? sha : meta.default_branch;
  const commit = (await (await gh(`${api}/commits/${encodeURIComponent(ref)}`)).json()) as {
    sha: string;
    commit: { committer: { date: string } };
  };
  const tree = (await (await gh(`${api}/git/trees/${commit.sha}?recursive=1`)).json()) as {
    tree: TreeEntry[];
    truncated?: boolean;
  };
  if (tree.truncated) say({ type: "progress", text: "Big repo: GitHub only listed part of it, using that part" });
  const blobs = tree.tree
    .filter((e) => e.type === "blob" && e.mode !== "120000" && safePath(e.path))
    .map((e) => ({ path: e.path, size: e.size ?? 0 }));

  const web = py.pyimport("headcrawl.web");
  const chosen = JSON.parse(String(web.choose_all(JSON.stringify(blobs)))) as { paths: string[]; complete: boolean };
  const paths = chosen.paths.filter(safePath);
  // A truncated tree or a full budget means we can't tell dead code from code we didn't fetch.
  const complete = chosen.complete && !tree.truncated;
  if (!paths.length) throw new GitHubError("No source files I can read in that repo.");

  const root = `/repo${++runs}`;
  let done = 0;
  await pool(paths, 8, async (path) => {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const full = `${root}/${path}`;
    py.FS.mkdirTree(full.slice(0, full.lastIndexOf("/")));
    py.FS.writeFile(full, bytes);
    done++;
    if (done % 20 === 0 || done === paths.length) say({ type: "progress", text: `Downloaded ${done} of ${paths.length} files` });
  });

  say({ type: "progress", text: "Turning the code into a dungeon" });
  const build = (hist: History = { counts: {}, subjects: {} }, years = {}) =>
    String(
      web.dungeon(
        root,
        meta.full_name,
        `https://github.com/${meta.full_name}`,
        commit.sha,
        commit.commit.committer.date,
        JSON.stringify(hist.counts),
        JSON.stringify(years),
        JSON.stringify(hist.subjects),
        complete,
      ),
    );
  try {
    const first = build();
    // Bosses come from how often code changes. We have no git history here,
    // so ask GitHub about the likely boss files, then build again with that.
    const picks = JSON.parse(String(web.candidates(first))) as string[];
    if (!picks.length) return first;
    say({ type: "progress", text: "Checking which files keep changing" });
    const hist = await history(api, commit.sha, picks);
    let years = {};
    if (token) {
      say({ type: "progress", text: "Dating every TODO with git blame" });
      const lines = JSON.parse(String(web.loot_lines(build(hist)))) as Record<string, number[]>;
      const [who, name] = meta.full_name.split("/");
      years = await blame(who, name, commit.sha, lines);
    }
    return build(hist, years);
  } finally {
    // Each build is a few MB in memory; don't keep old ones around.
    py.runPython(`import shutil; shutil.rmtree(${JSON.stringify(root)}, ignore_errors=True)`);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === "local") {
      say({ type: "done", json: await analyzeLocal(req) });
      return;
    }
    const { base, owner, repo, sha } = req;
    token = req.token && validToken(req.token) ? req.token : null;
    say({ type: "done", json: await analyze(base, owner, repo, sha) });
  } catch (err) {
    const text =
      err instanceof GitHubError
        ? err.message
        : err instanceof Error && err.name === "TimeoutError"
          ? "GitHub took too long to answer."
          : `The analyzer failed: ${err instanceof Error ? err.message.split("\n").filter(Boolean).at(-1) : String(err)}`;
    say({ type: "error", text });
  }
};
