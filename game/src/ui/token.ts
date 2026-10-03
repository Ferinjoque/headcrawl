// The player's own GitHub token. Optional: it raises GitHub's limit from 60
// to 5000 calls an hour and lets browser builds date their TODOs. Kept for
// this tab only unless the player asks to remember it.

import { validToken } from "../lite/protocol";

const KEY = "headcrawl.github-token";

export type TokenPlace = "none" | "tab" | "device";

function stores(): { tab: Storage | null; device: Storage | null } {
  const get = (name: "sessionStorage" | "localStorage"): Storage | null => {
    try {
      return (globalThis as unknown as Record<string, Storage | undefined>)[name] ?? null;
    } catch {
      return null;
    }
  };
  return { tab: get("sessionStorage"), device: get("localStorage") };
}

function read(store: Storage | null): string | null {
  try {
    const value = store?.getItem(KEY) ?? null;
    return value && validToken(value) ? value : null;
  } catch {
    return null;
  }
}

function drop(store: Storage | null): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // Blocked storage: nothing was kept there anyway.
  }
}

export function loadToken(): string | null {
  const { tab, device } = stores();
  return read(tab) ?? read(device);
}

export function tokenPlace(): TokenPlace {
  const { tab, device } = stores();
  if (read(device)) return "device";
  return read(tab) ? "tab" : "none";
}

/** Returns false when the text isn't a GitHub token or the browser won't store it. */
export function saveToken(raw: string, remember: boolean): boolean {
  const token = raw.trim();
  if (!validToken(token)) return false;
  const { tab, device } = stores();
  clearToken();
  try {
    (remember ? device : tab)?.setItem(KEY, token);
  } catch {
    return false;
  }
  return loadToken() === token;
}

export function clearToken(): void {
  const { tab, device } = stores();
  drop(tab);
  drop(device);
}
