export interface WorkerRequest {
  base: string;
  owner: string;
  repo: string;
  /** Pin a commit so a shared link rebuilds the same dungeon. */
  sha?: string;
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
