import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { xlsxExtractor } from "../src/extractors/xlsx.js";

async function buildFixture(path: string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const sheet1 = wb.addWorksheet("Sheet1");
  sheet1.addRow(["name", "amount", "memo"]);
  sheet1.addRow(["Alice", 100, "経費精算"]);
  sheet1.addRow(["Bob", 250, "出張交通費"]);
  const sheet2 = wb.addWorksheet("メモ");
  sheet2.addRow(["備考", "詳細"]);
  sheet2.addRow(["特になし", "Hello world"]);
  await wb.xlsx.writeFile(path);
}

test("xlsxExtractor produces one chunk per non-empty row with sheet+cell", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fam-xlsx-"));
  const path = join(dir, "f.xlsx");
  await buildFixture(path);

  const chunks = await xlsxExtractor.extract(path);
  assert.equal(chunks.length, 5);

  const sheet1Row2 = chunks.find(
    (c) =>
      c.location.kind === "xlsx" &&
      c.location.sheet === "Sheet1" &&
      c.location.cell === "A2",
  );
  assert.ok(sheet1Row2, "expected a chunk for Sheet1!A2");
  assert.match(sheet1Row2.text, /Alice/);
  assert.match(sheet1Row2.text, /100/);
  assert.match(sheet1Row2.text, /経費精算/);

  const sheet2Row2 = chunks.find(
    (c) =>
      c.location.kind === "xlsx" &&
      c.location.sheet === "メモ" &&
      c.location.cell === "A2",
  );
  assert.ok(sheet2Row2, "expected a chunk on the Japanese-named sheet");
  assert.match(sheet2Row2.text, /Hello world/);
});

test("xlsxExtractor.canHandle accepts .xlsx case-insensitively", () => {
  assert.equal(xlsxExtractor.canHandle("a.xlsx"), true);
  assert.equal(xlsxExtractor.canHandle("a.XLSX"), true);
  assert.equal(xlsxExtractor.canHandle("a.xls"), false);
  assert.equal(xlsxExtractor.canHandle("a.csv"), false);
});
