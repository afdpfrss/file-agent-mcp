import { readFile } from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import type { Extractor, ExtractedChunk } from "./types.js";

export const pdfExtractor: Extractor = {
  kind: "pdf",

  canHandle(filePath: string): boolean {
    return /\.pdf$/i.test(filePath);
  },

  async extract(filePath: string): Promise<ExtractedChunk[]> {
    const buf = await readFile(filePath);
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const result = await extractText(pdf, { mergePages: false });
    const pages: string[] = Array.isArray(result.text) ? result.text : [result.text];
    const chunks: ExtractedChunk[] = [];
    for (let i = 0; i < pages.length; i++) {
      const text = (pages[i] ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;
      chunks.push({
        text,
        location: { kind: "pdf", page: i + 1 },
      });
    }
    return chunks;
  },
};
