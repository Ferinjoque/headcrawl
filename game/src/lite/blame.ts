// GitHub's GraphQL blame, in batches. Kept apart from the worker so the
// query and the answer parsing can be tested without a network.

export const BLAME_BATCH = 10;

export interface BlameRange {
  startingLine: number;
  endingLine: number;
  commit: { committedDate: string; author?: { name?: string } | null };
}

/** One query for up to BLAME_BATCH files. Paths only ever travel as variables. */
export function blameQuery(owner: string, repo: string, sha: string, paths: string[]): { query: string; variables: Record<string, string> } {
  const vars = paths.map((_, k) => `$p${k}: String!`).join(", ");
  const fields = paths
    .map((_, k) => `f${k}: blame(path: $p${k}) { ranges { startingLine endingLine commit { committedDate author { name } } } }`)
    .join(" ");
  const query = `query($owner: String!, $name: String!, $sha: String!, ${vars}) { repository(owner: $owner, name: $name) { object(expression: $sha) { ... on Commit { ${fields} } } } }`;
  const variables: Record<string, string> = { owner, name: repo, sha };
  paths.forEach((path, k) => (variables[`p${k}`] = path));
  return { query, variables };
}

export interface LineBlame {
  year: number;
  author?: string;
}

/** {path: {line: {year, author}}} from one answer. Anything odd in it is skipped, not trusted. */
export function blameYears(body: unknown, paths: string[], lines: Record<string, number[]>): Record<string, Record<string, LineBlame>> {
  const object = (body as { data?: { repository?: { object?: Record<string, { ranges?: unknown } | null> | null } | null } })?.data
    ?.repository?.object;
  const out: Record<string, Record<string, LineBlame>> = {};
  paths.forEach((path, k) => {
    const raw = object?.[`f${k}`]?.ranges;
    const ranges = Array.isArray(raw) ? (raw as BlameRange[]) : [];
    const years: Record<string, LineBlame> = {};
    for (const line of lines[path] ?? []) {
      const hit = ranges.find((r) => r?.startingLine <= line && line <= r?.endingLine);
      const date = hit?.commit?.committedDate;
      const year = typeof date === "string" ? Number(date.slice(0, 4)) : NaN;
      if (!Number.isInteger(year) || year < 1970 || year > 2200) continue;
      const name = hit?.commit?.author?.name;
      years[String(line)] = typeof name === "string" && name.trim() ? { year, author: name.trim().slice(0, 100) } : { year };
    }
    out[path] = years;
  });
  return out;
}
