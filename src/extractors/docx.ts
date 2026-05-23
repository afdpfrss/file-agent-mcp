import mammoth from "mammoth";
import type { Extractor, ExtractedChunk } from "./types.js";

const BLOCK_END = /<\/(p|li|h[1-6]|tr|td|th|div)\s*>/gi;
const TAG = /<[^>]+>/g;
const SENTINEL = "";

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function paragraphsFromHtml(html: string): ExtractedChunk[] {
  const withSentinels = html.replace(BLOCK_END, SENTINEL);
  const stripped = withSentinels.replace(TAG, "");
  const decoded = decodeEntities(stripped);
  const parts = decoded
    .split(SENTINEL)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
  return parts.map<ExtractedChunk>((text, i) => ({
    text,
    location: { kind: "docx", paragraph: i + 1 },
  }));
}

export const docxExtractor: Extractor = {
  kind: "docx",

  canHandle(filePath: string): boolean {
    return /\.docx$/i.test(filePath);
  },

  async extract(filePath: string): Promise<ExtractedChunk[]> {
    const result = await mammoth.convertToHtml({ path: filePath });
    return paragraphsFromHtml(result.value);
  },
};

export const __test = { paragraphsFromHtml };
