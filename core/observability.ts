// Structured observability (spec §31). One JSON line per operation:
// { ts, level, requestId, operation, durationMs, status, ...fields }.
// Never log secrets, raw access codes, or personal data (spec §25/§48).

import crypto from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  status?: string | number;
  durationMs?: number;
  error?: string;
  [k: string]: unknown;
}

function emit(level: LogLevel, requestId: string, operation: string, fields: LogFields): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    requestId,
    operation,
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Run `fn`, log start-to-end with requestId/operation/duration/status. */
export async function withLogging<T>(
  operation: string,
  fn: (requestId: string) => Promise<T>,
  fields: LogFields = {},
): Promise<T> {
  const requestId = crypto.randomUUID();
  const start = Date.now();
  try {
    const result = await fn(requestId);
    emit("info", requestId, operation, { ...fields, durationMs: Date.now() - start, status: "ok" });
    return result;
  } catch (e) {
    emit("error", requestId, operation, {
      ...fields,
      durationMs: Date.now() - start,
      status: "error",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
