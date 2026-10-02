/// <reference lib="webworker" />
// Runs the real Python analyzer in the browser with Pyodide, on a background
// thread. Files come straight from GitHub: the tree API for the list, raw
// downloads for the contents. Nothing in the repo is ever executed; Python
// only reads the text, same as the command line tool.

import { safePath, type WorkerReply, type WorkerRequest } from "./protocol";

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
  const manifest = (await (await fetch(index + "manifest.json")).json()) as Manifest;
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

async function gh(url: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: "application/vnd.github+json" } });
  if (res.status === 403 || res.status === 429) {
    const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
    const minutes = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60_000)) : 60;
    throw new GitHubError(`GitHub's limit for anonymous requests is used up. Try again in ${minutes} minutes.`);
  }
  if (res.status === 404) throw new GitHubError("That repo doesn't exist, or it's private.");
  if (!res.ok) throw new GitHubError(`GitHub answered ${res.status}.`);
  return res;
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

async function analyze(base: string, owner: string, repo: string, sha?: string): Promise<string> {
  // A failed boot (say, a network blip) must not poison every later try.
  ready ??= boot(base).catch((err: unknown) => {
    ready = null;
    throw err;
  });
  const py = await ready;

  say({ type: "progress", text: `Asking GitHub about ${owner}/${repo}` });
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const meta = (await (await gh(api)).json()) as { default_branch: string; full_name: string; private: boolean };
  const ref = sha && /^[0-9a-f]{7,40}$/.test(sha) ? sha : meta.default_branch;
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
  const paths = (JSON.parse(String(web.choose(JSON.stringify(blobs)))) as string[]).filter(safePath);
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
  try {
    return String(
      web.dungeon(root, meta.full_name, `https://github.com/${meta.full_name}`, commit.sha, commit.commit.committer.date),
    );
  } finally {
    // Each build is a few MB in memory; don't keep old ones around.
    py.runPython(`import shutil; shutil.rmtree(${JSON.stringify(root)}, ignore_errors=True)`);
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { base, owner, repo, sha } = event.data;
  try {
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
