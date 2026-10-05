// Then vs now: two builds of one repo compared, either one playable.

import { compareSpecs } from "../lite/compare";
import type { Builder } from "./builder";
import { compareScreen } from "./screens";
import type { PlayRoute, Route } from "./share";

export interface CompareHooks {
  builder: Builder;
  navigate(route: Route): void;
  show(node: HTMLElement): void;
  freshRun(): number;
}

export class CompareView {
  private routes: { then: PlayRoute; now: PlayRoute } | null = null;

  private on: CompareHooks;

  constructor(on: CompareHooks) {
    this.on = on;
  }

  async show(owner: string, repo: string, a: string, b: string, current: () => boolean): Promise<void> {
    const pair = await this.on.builder.pair(owner, repo, a, b, current);
    if (!pair) return;
    const routes = {
      then: { kind: "github", owner, repo, sha: a, run: this.on.freshRun() },
      now: { kind: "github", owner, repo, sha: b, run: this.on.freshRun() },
    } as const;
    this.routes = routes;
    this.on.show(
      compareScreen(`${owner}/${repo}`, compareSpecs(...pair), {
        playThen: () => this.on.navigate(routes.then),
        playNow: () => this.on.navigate(routes.now),
        menu: () => this.on.navigate({ kind: "title" }),
      }),
    );
  }

  key(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || !this.routes) return;
    if (e.key === "1") this.on.navigate(this.routes.then);
    else if (e.key === "2") this.on.navigate(this.routes.now);
    else if (e.key === "Escape" || e.key === "m" || e.key === "M") this.on.navigate({ kind: "title" });
  }
}
