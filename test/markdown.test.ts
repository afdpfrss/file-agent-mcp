import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { markdownExtractor } from "../src/extractors/markdown.js";

test("markdownExtractor.canHandle accepts .md / .markdown / .mdx (case-insensitive)", () => {
  assert.equal(markdownExtractor.canHandle("foo.md"), true);
  assert.equal(markdownExtractor.canHandle("foo.MD"), true);
  assert.equal(markdownExtractor.canHandle("foo.markdown"), true);
  assert.equal(markdownExtractor.canHandle("foo.mdx"), true);
  assert.equal(markdownExtractor.canHandle("foo.txt"), false);
  assert.equal(markdownExtractor.canHandle("foo"), false);
});

test("markdownExtractor splits per line, skips blanks, 1-indexed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fam-md-"));
  const file = join(dir, "a.md");
  writeFileSync(file, "# Hello\n\nWorld 世界\n\n  \nfoo\n");
  const chunks = await markdownExtractor.extract(file);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], {
    text: "# Hello",
    location: { kind: "md", line: 1 },
  });
  assert.deepEqual(chunks[1], {
    text: "World 世界",
    location: { kind: "md", line: 3 },
  });
  assert.deepEqual(chunks[2], {
    text: "foo",
    location: { kind: "md", line: 6 },
  });
});

test("markdownExtractor normalizes CRLF to LF and strips BOM", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fam-md-"));
  const file = join(dir, "b.md");
  writeFileSync(file, "﻿alpha\r\nbeta\r\n");
  const chunks = await markdownExtractor.extract(file);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0]?.text, "alpha");
  assert.equal(chunks[1]?.text, "beta");
});
