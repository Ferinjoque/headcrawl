// Repos this browser built with the in-browser analyzer, newest first.

export interface Recent {
  owner: string;
  repo: string;
  sha: string;
}

const KEY = "headcrawl.recent.v1";
const KEEP = 6;
const OWNER = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;

export function recentBuilds(): Recent[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(data)) return [];
    // Storage is just another input; only keep entries that look right.
    return data
      .filter(
        (r): r is Recent =>
          typeof r === "object" && r !== null && OWNER.test(r.owner) && REPO.test(r.repo) && SHA.test(r.sha),
      )
      .slice(0, KEEP);
  } catch {
    return [];
  }
}

export function rememberBuild(entry: Recent): void {
  const rest = recentBuilds().filter((r) => `${r.owner}/${r.repo}`.toLowerCase() !== `${entry.owner}/${entry.repo}`.toLowerCase());
  try {
    localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, KEEP)));
  } catch {
    // Blocked storage: no list, nothing else breaks.
  }
}
