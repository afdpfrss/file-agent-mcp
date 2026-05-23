import { readFile } from "node:fs/promises";
import type { Extractor, ExtractedChunk } from "./types.js";

export const markdownExtractor: Extractor = {
  kind: "md",

  canHandle(filePath: string): boolean {
    return /\.(md|markdown|mdx)$/i.test(filePath);
  },

  async extract(filePath: string): Promise<ExtractedChunk[]> {
    const raw = await readFile(filePath, "utf8");
    const normalized = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
    const lines = normalized.split("\n");
    const chunks: ExtractedChunk[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      if (line.trim() === "") continue;
      chunks.push({
        text: line,
        location: { kind: "md", line: i + 1 },
      });
    }
    return chunks;
  },
};
