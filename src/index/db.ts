import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SCHEMA, SCHEMA_VERSION } from "./schema.js";
import type { FileKind } from "../extractors/types.js";

export interface FileRow {
  id: number;
  path: string;
  mtime: number;
  size: number;
  kind: FileKind;
}

export class IndexDB {
  readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("foreign_keys = ON");
    this.assertFts5Trigram();
    this.db.exec(SCHEMA);
    this.db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)")
      .run("schema_version", SCHEMA_VERSION);
  }

  private assertFts5Trigram(): void {
    try {
      this.db.exec(
        "CREATE VIRTUAL TABLE temp.__fts_probe USING fts5(t, tokenize='trigram');",
      );
      this.db.exec("DROP TABLE temp.__fts_probe;");
    } catch (err) {
      throw new Error(
        "SQLite build bundled with better-sqlite3 does not support FTS5 with the trigram tokenizer. " +
          "This is required by file-agent-mcp. " +
          `Underlying error: ${(err as Error).message}`,
      );
    }
  }

  close(): void {
    this.db.close();
  }

  getFileByPath(path: string): FileRow | undefined {
    return this.db
      .prepare("SELECT id, path, mtime, size, kind FROM files WHERE path = ?")
      .get(path) as FileRow | undefined;
  }

  listAllFiles(): FileRow[] {
    return this.db
      .prepare("SELECT id, path, mtime, size, kind FROM files")
      .all() as FileRow[];
  }

  insertFile(row: Omit<FileRow, "id">): number {
    const result = this.db
      .prepare(
        "INSERT INTO files (path, mtime, size, kind) VALUES (?, ?, ?, ?)",
      )
      .run(row.path, row.mtime, row.size, row.kind);
    return Number(result.lastInsertRowid);
  }

  updateFileMeta(id: number, mtime: number, size: number): void {
    this.db
      .prepare("UPDATE files SET mtime = ?, size = ? WHERE id = ?")
      .run(mtime, size, id);
  }

  deleteFile(id: number): void {
    this.db.prepare("DELETE FROM chunks_fts WHERE file_id = ?").run(id);
    this.db.prepare("DELETE FROM files WHERE id = ?").run(id);
  }

  deleteChunksOfFile(fileId: number): void {
    this.db.prepare("DELETE FROM chunks_fts WHERE file_id = ?").run(fileId);
  }

  insertChunk(fileId: number, text: string, locationJson: string): void {
    this.db
      .prepare(
        "INSERT INTO chunks_fts (text, file_id, location_json) VALUES (?, ?, ?)",
      )
      .run(text, fileId, locationJson);
  }
}
