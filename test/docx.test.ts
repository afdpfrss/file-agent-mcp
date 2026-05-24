import { test } from "node:test";
import assert from "node:assert/strict";
import { __test } from "../src/extractors/docx.js";

test("paragraphsFromHtml splits on block-level tags and assigns paragraph numbers", () => {
  const html =
    "<p>First paragraph.</p>" +
    "<p>Second with <strong>bold</strong> text.</p>" +
    "<h1>A heading</h1>" +
    "<ul><li>Item one</li><li>Item two</li></ul>";
  const chunks = __test.paragraphsFromHtml(html);
  assert.equal(chunks.length, 5);
  assert.equal(chunks[0]?.text, "First paragraph.");
  assert.deepEqual(chunks[0]?.location, { kind: "docx", paragraph: 1 });
  assert.equal(chunks[1]?.text, "Second with bold text.");
  assert.equal(chunks[2]?.text, "A heading");
  assert.equal(chunks[3]?.text, "Item one");
  assert.equal(chunks[4]?.text, "Item two");
});

test("paragraphsFromHtml decodes HTML entities and collapses whitespace", () => {
  const html = "<p>foo &amp; bar  &lt;baz&gt;&nbsp;qux</p>";
  const chunks = __test.paragraphsFromHtml(html);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.text, "foo & bar <baz> qux");
});

test("paragraphsFromHtml drops empty paragraphs", () => {
  const html = "<p></p><p>only one</p><p>   </p>";
  const chunks = __test.paragraphsFromHtml(html);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.text, "only one");
});
