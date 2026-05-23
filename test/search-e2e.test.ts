import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IndexDB } from "../src/index/db.js";
import { Ingester } from "../src/index/ingest.js";
import { SearchInputSchema, searchFiles } from "../src/tools/search.js";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "fam-e2e-"));
  mkdirSync(join(root, "subdir"));
  writeFileSync(
    join(root, "a.md"),
    "The quick brown fox\nJumps over the lazy dog\n",
  );
  writeFileSync(
    join(root, "subdir", "b.md"),
    "Hello world\nあいうえお かきくけこ\n世界\n",
  );
  const dbPath = join(root, ".file-agent-mcp", "index.db");
  const db = new IndexDB(dbPath);
  const ingester = new Ingester(db, root);
  return { root, db, ingester };
}

test("end-to-end: scanAll then searchFiles returns expected hits", async (t) => {
  const { db, ingester } = setup();
  t.after(() => db.close());

  const stats = await ingester.scanAll();
  assert.equal(stats.added, 2);
  assert.equal(stats.failed, 0);

  const r1 = searchFiles(db, SearchInputSchema.parse({ query: "fox" }));
  assert.equal(r1.total_hits, 1);
  assert.equal(r1.hits.length, 1);
  assert.equal(r1.hits[0]?.path, "a.md");
  assert.equal(r1.hits[0]?.kind, "md");
  assert.match(r1.hits[0]?.snippet ?? "", /<<fox>>/);
  assert.deepEqual(r1.hits[0]?.location, { kind: "md", line: 1 });
});

test("FTS5 trigram tokenizer matches Japanese substrings", async (t) => {
  const { db, ingester } = setup();
  t.after(() => db.close());
  await ingester.scanAll();

  const r = searchFiles(db, SearchInputSchema.parse({ query: "あいうえお" }));
  assert.equal(r.total_hits, 1);
  assert.equal(r.hits[0]?.path, "subdir/b.md");
});

test("kinds filter excludes non-matching file kinds", async (t) => {
  const { db, ingester } = setup();
  t.after(() => db.close());
  await ingester.scanAll();

  const r = searchFiles(
    db,
    SearchInputSchema.parse({ query: "fox", kinds: ["pdf"] }),
  );
  assert.equal(r.total_hits, 0);
});

test("path_prefix restricts results to matching paths", async (t) => {
  const { db, ingester } = setup();
  t.after(() => db.close());
  await ingester.scanAll();

  const r = searchFiles(
    db,
    SearchInputSchema.parse({ query: "Hello", path_prefix: "subdir/" }),
  );
  assert.equal(r.total_hits, 1);
  assert.equal(r.hits[0]?.path, "subdir/b.md");

  const r2 = searchFiles(
    db,
    SearchInputSchema.parse({ query: "Hello", path_prefix: "nope/" }),
  );
  assert.equal(r2.total_hits, 0);
});

test("re-scanning unchanged files reports 'unchanged'", async (t) => {
  const { db, ingester } = setup();
  t.after(() => db.close());
  await ingester.scanAll();
  const second = await ingester.scanAll();
  assert.equal(second.added, 0);
  assert.equal(second.unchanged, 2);
});

test("removed files are pruned on rescan", async (t) => {
  const { root, db, ingester } = setup();
  t.after(() => db.close());
  await ingester.scanAll();
  const { rmSync } = await import("node:fs");
  rmSync(join(root, "a.md"));
  const second = await ingester.scanAll();
  assert.equal(second.removed, 1);
  const after = searchFiles(db, SearchInputSchema.parse({ query: "fox" }));
  assert.equal(after.total_hits, 0);
});

test("editing a file replaces its chunks", async (t) => {
  const { root, db, ingester } = setup();
  t.after(() => db.close());
  await ingester.scanAll();
  // Bump mtime explicitly to defeat 1s-resolution coincidence
  const newContent = "Completely different content with banana\n";
  writeFileSync(join(root, "a.md"), newContent);
  const { utimesSync } = await import("node:fs");
  const future = new Date(Date.now() + 5_000);
  utimesSync(join(root, "a.md"), future, future);
  await ingester.scanAll();

  const oldQuery = searchFiles(db, SearchInputSchema.parse({ query: "fox" }));
  assert.equal(oldQuery.total_hits, 0);
  const newQuery = searchFiles(db, SearchInputSchema.parse({ query: "banana" }));
  assert.equal(newQuery.total_hits, 1);
});

test("input validation rejects empty query", () => {
  const result = SearchInputSchema.safeParse({ query: "" });
  assert.equal(result.success, false);
});

test("input validation caps limit at 100", () => {
  const result = SearchInputSchema.safeParse({ query: "x", limit: 999 });
  assert.equal(result.success, false);
});
