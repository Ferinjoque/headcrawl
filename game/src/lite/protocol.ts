export type WorkerRequest = GitHubRequest | LocalRequest;

/** A folder picked from the player's own disk. Files never leave the browser. */
export interface LocalRequest {
  kind: "local";
  base: string;
  name: string;
  files: { path: string; file: File }[];
}

export interface GitHubRequest {
  kind?: "github";
  base: string;
  owner: string;
  repo: string;
  /** A commit, tag or branch. Pinning a commit makes a link rebuild the same dungeon. */
  sha?: string;
  /** The player's own GitHub token, if they gave one in settings. */
  token?: string;
}

export type WorkerReply =
  | { type: "progress"; text: string }
  | { type: "done"; json: string }
  | { type: "error"; text: string };

const SHORTHAND = /^([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]{1,100})$/;

/** "owner/repo", "github.com/owner/repo" or a full GitHub URL. Null for anything else. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const text = input
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(www\.)?github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const parts = text.split("/");
  const m = parts.slice(0, 2).join("/").match(SHORTHAND);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return { owner: m[1], repo: m[2] };
}

/**
 * Tree paths go straight into Pyodide's file system, next to its own
 * site-packages. Python's choose() already refuses dot directories, but this
 * check doesn't rely on that.
 */
export function safePath(path: string): boolean {
  if (!path || path.length > 400 || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** A git ref we are willing to put in an API URL: tags like v1.2.0, branches, commits. */
export function validRef(ref: string): boolean {
  return /^[A-Za-z0-9._/-]{1,100}$/.test(ref) && !ref.includes("..") && !ref.startsWith("/") && !ref.endsWith("/");
}

/** Classic (ghp_) and fine-grained (github_pat_) personal access tokens. */
export function validToken(token: string): boolean {
  return /^(ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,255})$/.test(token);
}
