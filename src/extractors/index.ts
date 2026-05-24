import { markdownExtractor } from "./markdown.js";
import { docxExtractor } from "./docx.js";
import { xlsxExtractor } from "./xlsx.js";
import { pdfExtractor } from "./pdf.js";
import type { Extractor } from "./types.js";

export const extractors: readonly Extractor[] = [
  markdownExtractor,
  docxExtractor,
  xlsxExtractor,
  pdfExtractor,
] as const;

export function findExtractor(filePath: string): Extractor | undefined {
  return extractors.find((e) => e.canHandle(filePath));
}

export type { Extractor, ExtractedChunk, ChunkLocation, FileKind } from "./types.js";
