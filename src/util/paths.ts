import { relative, sep, posix } from "node:path";

const DEFAULT_IGNORED_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  ".file-agent-mcp",
  ".DS_Store",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
  ".venv",
  "__pycache__",
]);

export function toRelativePosix(rootAbs: string, fileAbs: string): string {
  const rel = relative(rootAbs, fileAbs);
  if (rel === "") return "";
  if (sep === posix.sep) return rel;
  return rel.split(sep).join(posix.sep);
}

export function pathHasIgnoredSegment(relOrName: string): boolean {
  for (const seg of relOrName.split(/[\\/]/)) {
    if (DEFAULT_IGNORED_SEGMENTS.has(seg)) return true;
  }
  return false;
}

export function isIgnoredSegment(segment: string): boolean {
  return DEFAULT_IGNORED_SEGMENTS.has(segment);
}
