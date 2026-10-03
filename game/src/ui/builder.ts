// Getting a dungeon from somewhere other than the gallery: a GitHub repo
// built in the browser, two commits of one compared, a folder on disk, or a
// dungeon.json file. Results are kept for the session so links open fast.

import { analyzeFolder, analyzeInBrowser } from "../lite/client";
import { parseRepo, validRef } from "../lite/protocol";
import { loadSpec, type DungeonSpec } from "../spec";
import { rememberBuild } from "./recent";
import { encodeSpec, type Route } from "./share";
import { loadToken } from "./token";

export interface BuildHost {
  /** Status line under the build forms. */
  status(text: string, tone?: string): void;
  /** A build is running (true) or finished or failed (false). */
  busy(on: boolean): void;
  navigate(route: Route): void;
  fail(message: string): void;
}

const NOT_A_REPO = "That doesn't look like owner/repo or a GitHub link.";

// Folders people pick often hold these; they're never the code you want to play.
const JUNK = /(^|\/)(node_modules|\.git|vendor|dist|build|target|__pycache__|\.venv|venv)\//;

export class Builder {
  private built = new Map<string, string>();
  private host: BuildHost;

  constructor(host: BuildHost) {
    this.host = host;
  }

  /** Runs the in-browser analyzer, remembering results so a link opens instantly. */
  async github(owner: string, repo: string, sha?: string): Promise<string | null> {
    const key = `${owner}/${repo}@${sha ?? "latest"}`.toLowerCase();
    const cached = this.built.get(key);
    if (cached) return cached;
    this.host.busy(true);
    this.host.status(`Building ${owner}/${repo}`, "t-loot");
    document.getElementById("build-status")?.scrollIntoView({ block: "center" });
    try {
      const json = await analyzeInBrowser(owner, repo, (text) => this.host.status(text, "t-loot"), sha, loadToken() ?? undefined);
      this.built.set(key, json);
      return json;
    } catch (err) {
      this.host.busy(false);
      this.host.status(err instanceof Error ? err.message : String(err), "error");
      return null;
    }
  }

  private remember(owner: string, repo: string, sha: string, json: string): void {
    this.built.set(`${owner}/${repo}@${sha}`.toLowerCase(), json);
  }

  async fromGitHub(target: string): Promise<void> {
    const repo = parseRepo(target);
    if (!repo) return this.host.status(NOT_A_REPO, "error");
    const json = await this.github(repo.owner, repo.repo);
    if (!json) return;
    const res = loadSpec(json);
    if (!res.ok) return this.host.status(res.error, "error");
    const sha = res.spec.repo.head;
    this.remember(repo.owner, repo.repo, sha, json);
    rememberBuild({ owner: repo.owner, repo: repo.repo, sha });
    this.host.navigate({ kind: "github", owner: repo.owner, repo: repo.repo, sha, run: 0 });
  }

  /** Build the same repo at an old ref and at its latest commit, then compare. */
  async compare(target: string, ref: string): Promise<void> {
    const repo = parseRepo(target);
    if (!repo) return this.host.status(NOT_A_REPO, "error");
    const then = ref.trim();
    if (!validRef(then)) return this.host.status("For then, give a tag, a branch or a commit, like v1.0.0.", "error");
    const old = await this.github(repo.owner, repo.repo, then);
    if (!old) return;
    const latest = await this.github(repo.owner, repo.repo);
    if (!latest) return;
    const a = loadSpec(old);
    const b = loadSpec(latest);
    if (!a.ok || !b.ok) return this.host.status("One of the two builds came out broken.", "error");
    this.remember(repo.owner, repo.repo, a.spec.repo.head, old);
    this.remember(repo.owner, repo.repo, b.spec.repo.head, latest);
    this.host.navigate({ kind: "compare", owner: repo.owner, repo: repo.repo, a: a.spec.repo.head, b: b.spec.repo.head });
  }

  /** Both sides of a then vs now link, built (or taken from this session). */
  async pair(owner: string, repo: string, a: string, b: string, current: () => boolean): Promise<[DungeonSpec, DungeonSpec] | null> {
    const old = await this.github(owner, repo, a);
    if (!current() || !old) return null;
    const latest = await this.github(owner, repo, b);
    if (!current() || !latest) return null;
    const then = loadSpec(old);
    const now = loadSpec(latest);
    if (!then.ok || !now.ok) {
      this.host.fail("One of the two builds came out broken.");
      return null;
    }
    return [then.spec, now.spec];
  }

  /** A folder from the player's own disk, analyzed in the worker like a GitHub repo. */
  async fromFolder(list: FileList): Promise<void> {
    const all = [...list];
    if (!all.length) return;
    const top = all[0].webkitRelativePath.split("/")[0] || "folder";
    const files = all
      .filter((f) => f.size <= 1024 * 1024 && !JUNK.test(f.webkitRelativePath))
      .slice(0, 20_000)
      .map((file) => ({ path: file.webkitRelativePath.split("/").slice(1).join("/"), file }));
    this.host.busy(true);
    this.host.status(`Reading ${top}`);
    try {
      const json = await analyzeFolder(top, files, (text) => this.host.status(text));
      const res = loadSpec(json);
      if (!res.ok) throw new Error(res.error);
      this.host.navigate({ kind: "custom", run: 0, data: encodeSpec(JSON.stringify(res.spec)) });
    } catch (err) {
      this.host.busy(false);
      this.host.status(err instanceof Error ? err.message : String(err), "error");
    }
  }

  async openFile(file: File): Promise<void> {
    if (file.size > 8 * 1024 * 1024) return this.host.fail("That file is too big for a dungeon.");
    const res = loadSpec(await file.text());
    if (!res.ok) return this.host.fail(res.error);
    // Re-serialise so the link holds exactly what was validated.
    this.host.navigate({ kind: "custom", run: 0, data: encodeSpec(JSON.stringify(res.spec)) });
  }
}
