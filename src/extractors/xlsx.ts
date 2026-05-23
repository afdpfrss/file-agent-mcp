import ExcelJS from "exceljs";
import type { Extractor, ExtractedChunk } from "./types.js";

function cellValueToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (typeof v.text === "string") return v.text;
    if (Array.isArray(v.richText)) {
      return v.richText
        .map((r) =>
          r && typeof r === "object" && "text" in r && typeof r.text === "string"
            ? r.text
            : "",
        )
        .join("");
    }
    if ("result" in v) {
      return cellValueToText(v.result as ExcelJS.CellValue);
    }
    if (typeof v.hyperlink === "string") {
      const label = typeof v.text === "string" ? v.text : "";
      return `${label} ${v.hyperlink}`.trim();
    }
    if ("error" in v) return "";
  }
  return "";
}

export const xlsxExtractor: Extractor = {
  kind: "xlsx",

  canHandle(filePath: string): boolean {
    return /\.xlsx$/i.test(filePath);
  },

  async extract(filePath: string): Promise<ExtractedChunk[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const chunks: ExtractedChunk[] = [];
    workbook.eachSheet((sheet) => {
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const parts: string[] = [];
        row.eachCell({ includeEmpty: false }, (cell) => {
          const t = cellValueToText(cell.value);
          if (t) parts.push(t);
        });
        if (parts.length === 0) return;
        chunks.push({
          text: parts.join("\t"),
          location: {
            kind: "xlsx",
            sheet: sheet.name,
            cell: `A${rowNumber}`,
          },
        });
      });
    });
    return chunks;
  },
};
