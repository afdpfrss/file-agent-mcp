import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtractedChunk } from "../extractors/types.js";
import { findExtractor } from "../extractors/index.js";
import { log } from "../util/logger.js";
import { pathHasIgnoredSegment, toRelativePosix } from "../util/paths.js";
import type { IndexDB } from "./db.js";

export type IngestResult = "added" | "updated" | "unchanged" | "skipped";

export interface ScanStats {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  failed: number;
}

export class Ingester {
  private readonly replaceChunks: (fileId: number, chunks: ExtractedChunk[]) => void;

  constructor(
    readonly db: IndexDB,
    readonly rootAbs: string,
  ) {
    this.replaceChunks = db.db.transaction(
      (fileId: number, chunks: ExtractedChunk[]) => {
        db.deleteChunksOfFile(fileId);
        for (const c of chunks) {
          db.insertChunk(fileId, c.text, JSON.stringify(c.location));
        }
      },
    );
  }

  async scanAll(): Promise<ScanStats> {
    const stats: ScanStats = {
      added: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      failed: 0,
    };
    const seen = new Set<string>();
    await this.walk(this.rootAbs, async (absPath, st) => {
      const rel = toRelativePosix(this.rootAbs, absPath);
      if (!rel) return;
      seen.add(rel);
      try {
        const result = await this.ingestFile(absPath, rel, st.mtimeMs, st.size);
        if (result === "added") stats.added++;
        else if (result === "updated") stats.updated++;
        else if (result === "unchanged") stats.unchanged++;
      } catch (err) {
        stats.failed++;
        log.warn(`ingest failed ${rel}: ${(err as Error).message}`);
      }
    });
    for (const row of this.db.listAllFiles()) {
      if (!seen.has(row.path)) {
        this.db.deleteFile(row.id);
        stats.removed++;
      }
    }
    return stats;
  }

  async ingestFile(
    absPath: string,
    relPath: string,
    mtimeMs: number,
    size: number,
  ): Promise<IngestResult> {
    const extractor = findExtractor(absPath);
    if (!extractor) return "skipped";
    const mtime = Math.floor(mtimeMs);
    const existing = this.db.getFileByPath(relPath);
    if (existing && existing.mtime === mtime && existing.size === size) {
      return "unchanged";
    }
    const chunks = await extractor.extract(absPath);
    if (existing) {
      this.db.updateFileMeta(existing.id, mtime, size);
      this.replaceChunks(existing.id, chunks);
      return "updated";
    }
    const id = this.db.insertFile({
      path: relPath,
      mtime,
      size,
      kind: extractor.kind,
    });
    this.replaceChunks(id, chunks);
    return "added";
  }

  removeFileByRel(relPath: string): boolean {
    const existing = this.db.getFileByPath(relPath);
    if (!existing) return false;
    this.db.deleteFile(existing.id);
    return true;
  }

  private async walk(
    dir: string,
    cb: (absPath: string, st: import("node:fs").Stats) => Promise<void>,
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (err) {
      log.warn(`cannot read ${dir}: ${(err as Error).message}`);
      return;
    }
    for (const entry of entries) {
      if (pathHasIgnoredSegment(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await this.walk(abs, cb);
      } else if (entry.isFile()) {
        try {
          const st = await stat(abs);
          await cb(abs, st);
        } catch (err) {
          log.warn(`cannot stat ${abs}: ${(err as Error).message}`);
        }
      }
    }
  }
}
