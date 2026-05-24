import { test } from "node:test";
import assert from "node:assert/strict";
import { sep, posix } from "node:path";
import {
  toRelativePosix,
  pathHasIgnoredSegment,
  isIgnoredSegment,
} from "../src/util/paths.js";

test("toRelativePosix produces forward-slash paths", () => {
  const root = sep === "\\" ? "C:\\root" : "/root";
  const file = sep === "\\" ? "C:\\root\\sub\\a.md" : "/root/sub/a.md";
  const rel = toRelativePosix(root, file);
  assert.equal(rel, "sub/a.md");
  assert.ok(!rel.includes("\\"));
  assert.ok(rel.includes(posix.sep));
});

test("toRelativePosix returns empty string when root == file", () => {
  const root = sep === "\\" ? "C:\\root" : "/root";
  assert.equal(toRelativePosix(root, root), "");
});

test("pathHasIgnoredSegment catches default-ignored dirs in either separator", () => {
  assert.equal(pathHasIgnoredSegment("node_modules/foo/a.md"), true);
  assert.equal(pathHasIgnoredSegment("foo/.git/HEAD"), true);
  assert.equal(pathHasIgnoredSegment("foo\\node_modules\\bar"), true);
  assert.equal(pathHasIgnoredSegment("foo/bar/baz.md"), false);
  assert.equal(pathHasIgnoredSegment(".file-agent-mcp"), true);
});

test("isIgnoredSegment matches exact default-ignored segments", () => {
  assert.equal(isIgnoredSegment("node_modules"), true);
  assert.equal(isIgnoredSegment(".git"), true);
  assert.equal(isIgnoredSegment("src"), false);
});
