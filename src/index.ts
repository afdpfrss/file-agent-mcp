#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { IndexDB } from "./index/db.js";
import { Ingester } from "./index/ingest.js";
import { Watcher } from "./index/watcher.js";
import { runMcpServer } from "./server.js";
import { log } from "./util/logger.js";

const PKG_VERSION = "0.1.0";

const HELP = `file-agent-mcp <root-path>

  MCP server for full-text search across local files (Markdown / DOCX / XLSX / PDF).

Options:
  --db-path <path>     Override DB location
                       (default: <root>/.file-agent-mcp/index.db)
  --no-watch           One-shot index build; skip live file watching.
  --version            Print version and exit.
  --help               Print this help and exit.

Env:
  FILE_AGENT_ROOT      Same as positional <root-path>.
`;

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: {
      "db-path": { type: "string" },
      "no-watch": { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (parsed.values.help) {
    process.stdout.write(HELP);
    return;
  }
  if (parsed.values.version) {
    process.stdout.write(`${PKG_VERSION}\n`);
    return;
  }

  const rootArg = parsed.positionals[0] ?? process.env.FILE_AGENT_ROOT;
  if (!rootArg) {
    process.stderr.write("error: <root-path> is required\n\n");
    process.stderr.write(HELP);
    process.exit(1);
  }
  const rootAbs = resolve(rootArg);
  if (!existsSync(rootAbs) || !statSync(rootAbs).isDirectory()) {
    process.stderr.write(`error: not a directory: ${rootAbs}\n`);
    process.exit(1);
  }
  const dbPath =
    parsed.values["db-path"] ?? join(rootAbs, ".file-agent-mcp", "index.db");

  log.info(`root: ${rootAbs}`);
  log.info(`db:   ${dbPath}`);

  const db = new IndexDB(dbPath);
  const ingester = new Ingester(db, rootAbs);

  log.info("scanning...");
  const t0 = Date.now();
  const stats = await ingester.scanAll();
  log.info(
    `scan done in ${Date.now() - t0}ms ` +
      `(+${stats.added} ~${stats.updated} =${stats.unchanged} -${stats.removed} !${stats.failed})`,
  );

  let watcher: Watcher | null = null;
  if (!parsed.values["no-watch"]) {
    watcher = new Watcher(rootAbs, ingester);
    watcher.start();
  }

  const shutdown = async (sig: string): Promise<void> => {
    log.info(`received ${sig}, shutting down`);
    if (watcher) await watcher.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await runMcpServer(db);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
