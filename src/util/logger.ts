type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string): void {
  process.stderr.write(
    `[file-agent-mcp ${new Date().toISOString()} ${level}] ${msg}\n`,
  );
}

export const log = {
  info(msg: string): void {
    emit("info", msg);
  },
  warn(msg: string): void {
    emit("warn", msg);
  },
  error(msg: string): void {
    emit("error", msg);
  },
};
