// Main-thread side of the in-browser analyzer. One worker for the whole
// session, so Python only boots once.

import type { WorkerReply, WorkerRequest } from "./protocol";

let worker: Worker | null = null;
let busy = false;
const WATCHDOG_MS = 150_000;

export function analyzeInBrowser(
  owner: string,
  repo: string,
  onProgress: (text: string) => void,
  sha?: string,
  token?: string,
): Promise<string> {
  return run({ base: document.baseURI, owner, repo, sha, token }, onProgress);
}

/** A folder from the player's disk, picked with a directory input. */
export function analyzeFolder(name: string, files: { path: string; file: File }[], onProgress: (text: string) => void): Promise<string> {
  return run({ kind: "local", base: document.baseURI, name, files }, onProgress);
}

function run(request: WorkerRequest, onProgress: (text: string) => void): Promise<string> {
  if (busy) return Promise.reject(new Error("Already analyzing a repo."));
  worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  busy = true;
  return new Promise((resolve, reject) => {
    // Python can't be interrupted from inside, so a stuck run is killed from here.
    const watchdog = setTimeout(() => {
      w.terminate();
      worker = null;
      busy = false;
      reject(new Error("That repo took too long to analyze. Try a smaller one, or the command line tool."));
    }, WATCHDOG_MS);
    w.onmessage = (event: MessageEvent<WorkerReply>) => {
      const msg = event.data;
      if (msg.type === "progress") onProgress(msg.text);
      else {
        clearTimeout(watchdog);
        busy = false;
        if (msg.type === "done") resolve(msg.json);
        else reject(new Error(msg.text));
      }
    };
    w.onerror = () => {
      clearTimeout(watchdog);
      w.terminate();
      busy = false;
      worker = null;
      reject(new Error("The analyzer crashed. Try again, or reload the page."));
    };
    w.postMessage(request);
  });
}
