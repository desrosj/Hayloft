import pino from "pino";
import { mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const logsDir = resolve(process.cwd(), "logs");
if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });

const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const isDev = process.env.NODE_ENV !== "production";

export function createLogger(name: string) {
  // Synchronous stdout (or pretty in dev) — avoids async-transport flush issues on early exit.
  return pino({
    name,
    level: process.env.LOG_LEVEL ?? "info",
    base: { name },
    transport: isDev
      ? {
          targets: [
            {
              target: "pino-pretty",
              level: "info",
              options: {
                colorize: true,
                singleLine: false,
                translateTime: "HH:MM:ss",
                ignore: "pid,hostname,name",
              },
            },
            {
              target: "pino/file",
              level: "debug",
              options: {
                destination: resolve(logsDir, `${name}-${runStamp}.log`),
                mkdir: true,
                sync: true,
              },
            },
          ],
        }
      : undefined,
  });
}

export const logger = createLogger("app");
