import { z } from "zod";
import type { IndexDB } from "../index/db.js";
import { FILE_KINDS, type ChunkLocation, type FileKind } from "../extractors/types.js";

export const FileKindEnum = z.enum(FILE_KINDS as readonly [FileKind, ...FileKind[]]);

export const SearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  limit: z.number().int().positive().max(100).default(20),
  kinds: z.array(FileKindEnum).nonempty().optional(),
  path_prefix: z.string().max(500).optional(),
});

export type SearchInput = z.infer<typeof SearchInputSchema>;

export interface SearchHit {
  path: string;
  kind: FileKind;
  location: ChunkLocation;
  snippet: string;
  score: number;
}

export interface SearchOutput {
  query: string;
  total_hits: number;
  hits: SearchHit[];
}

interface Row {
  path: string;
  kind: FileKind;
  location_json: string;
  snippet: string;
  score: number;
}

function escapeLike(s: string): string {
  return s.replace(/[!%_]/g, (m) => `!${m}`);
}

export function searchFiles(db: IndexDB, input: SearchInput): SearchOutput {
  const params: unknown[] = [input.query];
  const whereClauses: string[] = ["chunks_fts MATCH ?"];

  if (input.kinds && input.kinds.length > 0) {
    whereClauses.push(
      `files.kind IN (${input.kinds.map(() => "?").join(",")})`,
    );
    params.push(...input.kinds);
  }
  if (input.path_prefix) {
    whereClauses.push("files.path LIKE ? ESCAPE '!'");
    params.push(escapeLike(input.path_prefix) + "%");
  }
  const where = whereClauses.join(" AND ");

  const listSql = `
    SELECT
      files.path AS path,
      files.kind AS kind,
      chunks_fts.location_json AS location_json,
      snippet(chunks_fts, 0, '<<', '>>', '…', 32) AS snippet,
      bm25(chunks_fts) AS score
    FROM chunks_fts
    JOIN files ON files.id = chunks_fts.file_id
    WHERE ${where}
    ORDER BY bm25(chunks_fts) ASC
    LIMIT ?
  `;
  const countSql = `
    SELECT COUNT(*) AS c
    FROM chunks_fts
    JOIN files ON files.id = chunks_fts.file_id
    WHERE ${where}
  `;

  let rows: Row[];
  let totalHits: number;
  try {
    rows = db.db.prepare(listSql).all(...params, input.limit) as Row[];
    const countRow = db.db.prepare(countSql).get(...params) as { c: number };
    totalHits = countRow.c;
  } catch (err) {
    throw new Error(`search failed: ${(err as Error).message}`);
  }

  const hits: SearchHit[] = rows.map((r) => ({
    path: r.path,
    kind: r.kind,
    location: JSON.parse(r.location_json) as ChunkLocation,
    snippet: r.snippet,
    score: -r.score,
  }));

  return {
    query: input.query,
    total_hits: totalHits,
    hits,
  };
}
