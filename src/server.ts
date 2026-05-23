import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { SearchInputSchema, searchFiles } from "./tools/search.js";
import type { IndexDB } from "./index/db.js";
import { log } from "./util/logger.js";

const PKG_NAME = "file-agent-mcp";
const PKG_VERSION = "0.1.0";

export async function runMcpServer(db: IndexDB): Promise<void> {
  const server = new Server(
    { name: PKG_NAME, version: PKG_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_files",
        description:
          "Full-text search across indexed local files (Markdown, DOCX, XLSX, PDF). " +
          "Uses SQLite FTS5 with the trigram tokenizer so Japanese substring matching works. " +
          "Returns ranked hits with file path, format-specific location (line / paragraph / sheet+cell / page), " +
          "highlighted snippet, and BM25-derived score.",
        inputSchema: {
          type: "object",
          required: ["query"],
          properties: {
            query: {
              type: "string",
              description:
                "FTS5 query string. Plain keywords are AND-ed; use OR / NEAR / phrase quoting per FTS5 syntax.",
              minLength: 1,
              maxLength: 500,
            },
            limit: {
              type: "integer",
              description: "Maximum hits returned. Default 20, max 100.",
              minimum: 1,
              maximum: 100,
            },
            kinds: {
              type: "array",
              items: { type: "string", enum: ["md", "docx", "xlsx", "pdf"] },
              description: "Filter by file kinds.",
            },
            path_prefix: {
              type: "string",
              description:
                "Restrict to paths starting with this prefix (POSIX-style, relative to index root).",
            },
          },
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    if (req.params.name !== "search_files") {
      throw new Error(`Unknown tool: ${req.params.name}`);
    }
    const parsed = SearchInputSchema.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Invalid arguments: ${parsed.error.message}`,
          },
        ],
      };
    }
    try {
      const result = searchFiles(db, parsed.data);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: (err as Error).message }],
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP stdio server connected");
}
