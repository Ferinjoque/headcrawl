import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { blameQuery, blameYears } from "../src/lite/blame";
import { validToken } from "../src/lite/protocol";
import { clearToken, loadToken, saveToken, tokenPlace } from "../src/ui/token";

// Shaped like real tokens, made up for the tests.
const CLASSIC = "ghp_" + "a1".repeat(18);
const FINE = "github_pat_" + "B2_c".repeat(20);

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  };
}

describe("validToken", () => {
  it("takes classic and fine-grained tokens", () => {
    expect(validToken(CLASSIC)).toBe(true);
    expect(validToken(FINE)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const bad of ["", "ghp_short", `${CLASSIC} `, `${CLASSIC}\nX-Evil: 1`, "gho_" + "a".repeat(36), "Bearer " + CLASSIC]) {
      expect(validToken(bad)).toBe(false);
    }
  });
});

describe("token store", () => {
  const g = globalThis as { sessionStorage?: Storage; localStorage?: Storage };
  beforeEach(() => {
    g.sessionStorage = fakeStorage();
    g.localStorage = fakeStorage();
  });
  afterEach(() => {
    delete g.sessionStorage;
    delete g.localStorage;
  });

  it("keeps the token for the tab unless asked to remember it", () => {
    expect(saveToken(` ${FINE} `, false)).toBe(true);
    expect(loadToken()).toBe(FINE);
    expect(tokenPlace()).toBe("tab");
    expect(g.localStorage!.length).toBe(0);
  });

  it("remembering moves it, and forgetting clears both", () => {
    saveToken(CLASSIC, false);
    saveToken(FINE, true);
    expect(tokenPlace()).toBe("device");
    expect(g.sessionStorage!.length).toBe(0);
    clearToken();
    expect(loadToken()).toBeNull();
    expect(tokenPlace()).toBe("none");
  });

  it("refuses junk and ignores junk already stored", () => {
    expect(saveToken("hunter2", true)).toBe(false);
    g.localStorage!.setItem("headcrawl.github-token", "not a token");
    expect(loadToken()).toBeNull();
  });

  it("works with no storage at all", () => {
    delete g.sessionStorage;
    delete g.localStorage;
    expect(saveToken(FINE, false)).toBe(false);
    expect(loadToken()).toBeNull();
    clearToken();
  });
});

describe("blame", () => {
  it("sends paths as variables, never inside the query", () => {
    const path = 'src/"x") { evil }.py';
    const { query, variables } = blameQuery("o", "r", "abc", [path, "b.py"]);
    expect(query).not.toContain("evil");
    expect(query).toContain("f1: blame(path: $p1)");
    expect(variables).toEqual({ owner: "o", name: "r", sha: "abc", p0: path, p1: "b.py" });
  });

  it("maps each loot line to the year of its range", () => {
    const body = {
      data: {
        repository: {
          object: {
            f0: {
              ranges: [
                { startingLine: 1, endingLine: 4, commit: { committedDate: "2014-03-01T10:00:00Z" } },
                { startingLine: 5, endingLine: 9, commit: { committedDate: "2021-07-12T10:00:00Z", author: { name: " Ada " } } },
              ],
            },
            f1: null,
          },
        },
      },
    };
    const years = blameYears(body, ["a.py", "gone.py"], { "a.py": [2, 7, 40], "gone.py": [1] });
    expect(years).toEqual({ "a.py": { "2": { year: 2014 }, "7": { year: 2021, author: "Ada" } }, "gone.py": {} });
  });

  it("skips odd answers instead of trusting them", () => {
    expect(blameYears({ errors: [{ message: "nope" }] }, ["a.py"], { "a.py": [1] })).toEqual({ "a.py": {} });
    expect(blameYears(null, ["a.py"], { "a.py": [1] })).toEqual({ "a.py": {} });
    const weird = { data: { repository: { object: { f0: { ranges: [{ startingLine: 1, endingLine: 9, commit: { committedDate: "1066-01-01" } }, "x"] } } } } };
    expect(blameYears(weird, ["a.py"], { "a.py": [3] })).toEqual({ "a.py": {} });
  });
});
