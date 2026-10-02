// Main-thread side of the in-browser analyzer. One worker for the whole
// session, so Python only boots once.

import type { WorkerReply, WorkerRequest } from "./protocol";

let worker: Worker | null = null;
let busy = false;

export function analyzeInBrowser(owner: string, repo: string, onProgress: (text: string) => void): Promise<string> {
  if (busy) return Promise.reject(new Error("Already analyzing a repo."));
  worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const w = worker;
  busy = true;
  return new Promise((resolve, reject) => {
    w.onmessage = (event: MessageEvent<WorkerReply>) => {
      const msg = event.data;
      if (msg.type === "progress") onProgress(msg.text);
      else {
        busy = false;
        if (msg.type === "done") resolve(msg.json);
        else reject(new Error(msg.text));
      }
    };
    w.onerror = () => {
      busy = false;
      worker = null;
      reject(new Error("The analyzer crashed. Reload the page and try again."));
    };
    const request: WorkerRequest = { base: document.baseURI, owner, repo };
    w.postMessage(request);
  });
}
