import chokidar, { type FSWatcher } from "chokidar";
import { stat } from "node:fs/promises";
import type { Ingester } from "./ingest.js";
import { log } from "../util/logger.js";
import { pathHasIgnoredSegment, toRelativePosix } from "../util/paths.js";

const DEBOUNCE_MS = 200;

export class Watcher {
  private watcher: FSWatcher | null = null;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly rootAbs: string,
    private readonly ingester: Ingester,
  ) {}

  start(): void {
    this.watcher = chokidar.watch(this.rootAbs, {
      ignoreInitial: true,
      persistent: true,
      ignored: (p: string) => {
        const rel = toRelativePosix(this.rootAbs, p);
        return pathHasIgnoredSegment(rel);
      },
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 50,
      },
    });
    this.watcher
      .on("add", (p) => this.schedule(p, "upsert"))
      .on("change", (p) => this.schedule(p, "upsert"))
      .on("unlink", (p) => this.schedule(p, "remove"))
      .on("error", (err) =>
        log.warn(`watcher error: ${(err as Error).message ?? err}`),
      );
    log.info(`watching ${this.rootAbs}`);
  }

  private schedule(absPath: string, action: "upsert" | "remove"): void {
    const existing = this.timers.get(absPath);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.timers.delete(absPath);
      void this.apply(absPath, action);
    }, DEBOUNCE_MS);
    this.timers.set(absPath, t);
  }

  private async apply(absPath: string, action: "upsert" | "remove"): Promise<void> {
    const rel = toRelativePosix(this.rootAbs, absPath);
    try {
      if (action === "remove") {
        if (this.ingester.removeFileByRel(rel)) {
          log.info(`removed ${rel}`);
        }
        return;
      }
      const st = await stat(absPath);
      const result = await this.ingester.ingestFile(
        absPath,
        rel,
        st.mtimeMs,
        st.size,
      );
      if (result === "added" || result === "updated") {
        log.info(`${result} ${rel}`);
      }
    } catch (err) {
      log.warn(`watch apply ${action} ${rel}: ${(err as Error).message}`);
    }
  }

  async stop(): Promise<void> {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
