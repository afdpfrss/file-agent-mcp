export type FileKind = "md" | "docx" | "xlsx" | "pdf";

export const FILE_KINDS: readonly FileKind[] = ["md", "docx", "xlsx", "pdf"] as const;

export type ChunkLocation =
  | { kind: "md"; line: number }
  | { kind: "docx"; paragraph: number }
  | { kind: "xlsx"; sheet: string; cell: string }
  | { kind: "pdf"; page: number };

export interface ExtractedChunk {
  text: string;
  location: ChunkLocation;
}

export interface Extractor {
  readonly kind: FileKind;
  canHandle(filePath: string): boolean;
  extract(filePath: string): Promise<ExtractedChunk[]>;
}
