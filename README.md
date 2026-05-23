# file-agent-mcp

MCP server providing **full-text search** across local files (Markdown / DOCX / XLSX / PDF) backed by SQLite FTS5.

Sister project of [`md-agent-mcp`](https://www.npmjs.com/package/md-agent-mcp) — same "give the LLM grep, not vibes" philosophy, but multi-format and disk-backed. Search-only; no edits.

## Quick start

```sh
npx file-agent-mcp /path/to/your/folder
```

The server speaks the [Model Context Protocol](https://modelcontextprotocol.io) over stdio.

### Claude Desktop / Cursor config

```jsonc
{
  "mcpServers": {
    "files": {
      "command": "npx",
      "args": ["-y", "file-agent-mcp", "/Users/you/Documents/notes"]
    }
  }
}
```

## Supported formats (MVP)

| Extension     | Location returned                  |
| ------------- | ---------------------------------- |
| `.md` `.mdx`  | `{ kind: "md", line }`             |
| `.docx`       | `{ kind: "docx", paragraph }`      |
| `.xlsx`       | `{ kind: "xlsx", sheet, cell }`    |
| `.pdf`        | `{ kind: "pdf", page }`            |

Tokenizer: FTS5 `trigram`. Japanese substring queries (≥3 chars) hit the index; 1–2 char queries fall back to a LIKE-style scan.

## Tool: `search_files`

Input:

```jsonc
{
  "query": "経費精算",          // FTS5 query; multiple keywords are AND-ed
  "limit": 20,                   // optional, default 20, max 100
  "kinds": ["md", "pdf"],        // optional kind filter
  "path_prefix": "docs/"         // optional POSIX-style prefix
}
```

Output:

```jsonc
{
  "query": "経費精算",
  "total_hits": 3,
  "hits": [
    {
      "path": "docs/expense.md",
      "kind": "md",
      "location": { "kind": "md", "line": 12 },
      "snippet": "…<<経費精算>>のフローは以下…",
      "score": 3.42
    }
  ]
}
```

Scores: higher is better (negated BM25).

## CLI

```
file-agent-mcp <root-path>

Options:
  --db-path <path>     Override DB location
                       (default: <root>/.file-agent-mcp/index.db)
  --no-watch           One-shot index build, no live updates
  --version
  --help
```

The DB lives at `<root>/.file-agent-mcp/index.db` by default. Consider adding `.file-agent-mcp/` to your `.gitignore`.

## Architecture

```
src/
  index.ts          CLI entry, scan + watch + serve
  server.ts         MCP stdio server, tool handlers
  tools/search.ts   search_files tool
  index/
    db.ts           better-sqlite3 wrapper, FTS5 trigram assertion
    schema.ts       FTS5 + meta schema
    ingest.ts       file walk + extractor dispatch + incremental upserts
    watcher.ts      chokidar integration
  extractors/
    types.ts        Extractor interface
    markdown.ts     line-based chunks
    docx.ts         mammoth HTML → paragraph chunks
    xlsx.ts         exceljs row chunks with sheet+cell locator
    pdf.ts          unpdf page chunks
  util/
    paths.ts        POSIX path normalization, ignore segments
    logger.ts       stderr-only logger
```

Extractors are pluggable: implement `Extractor` and add to `src/extractors/index.ts`. Future v0.2 extractors (OCR for images, Whisper for audio/video) plug into the same interface.

## Status

* **v0.1 (this release)**: search-only MVP across MD / DOCX / XLSX / PDF.
* **v0.2 (planned)**: image OCR, audio/video transcription, optional embedding-based hybrid search.

Out of scope (forever): file editing, PR integration, remote storage adapters. Those live in sister projects.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

Requires Node.js ≥ 22. CI runs on Linux / macOS / Windows × Node 22 / 24.

## License

MIT
