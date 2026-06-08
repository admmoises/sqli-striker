import { type NextRequest } from "next/server";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { SQLMAP_BIN } from "@/lib/sqlmap-config";
import { buildArgs, type ScanRequest } from "@/lib/sqlmap-args";
import { registerScan, removeScan } from "@/lib/scan-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Env vars passed through to the sqlmap child. Keep this list minimal — we
 * do NOT want to leak server-side secrets (API keys, DB URLs, AWS creds, etc.)
 * into a subprocess we're streaming output from.
 */
const ALLOWED_ENV: readonly string[] = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TERM"];

/** Max bytes we'll hold in a per-stream line buffer before forcibly flushing. */
const LINE_BUFFER_CAP = 65536;

/** Encode a single SSE event with a typed event name and JSON payload. */
function sseEvent(event: string, payload: unknown): string {
  const data = JSON.stringify(payload);
  return `event: ${event}\ndata: ${data}\n\n`;
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: ScanRequest;
  try {
    body = (await req.json()) as ScanRequest;
  } catch {
    return new Response(
      JSON.stringify({ error: "invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const validation = buildArgs(body);
  if (!validation.ok) {
    return new Response(
      JSON.stringify({ error: "validation failed", details: validation.errors }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const scanId = randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Initial meta event — the client uses this to learn the scanId and PID.
      safeEnqueue(
        sseEvent("meta", {
          scanId,
          target: body.target,
          args: validation.args,
          bin: SQLMAP_BIN,
          startedAt: Date.now(),
        }),
      );

      // Build a minimal child env from the allow-list so we don't leak
      // server secrets into the sqlmap subprocess. Cast to NodeJS.ProcessEnv
      // because Next's augmented typings declare NODE_ENV as a required
      // string literal — but we genuinely don't want NODE_ENV in the child.
      const childEnv: Record<string, string> = { PYTHONUNBUFFERED: "1" };
      for (const k of ALLOWED_ENV) {
        const v = process.env[k];
        if (typeof v === "string" && v.length > 0) {
          childEnv[k] = v;
        }
      }

      const child = spawn(SQLMAP_BIN, validation.args, {
        stdio: ["ignore", "pipe", "pipe"] as const,
        env: childEnv as NodeJS.ProcessEnv,
      });

      // With stdio ["ignore","pipe","pipe"] both streams are guaranteed
      // non-null at runtime — narrow the types for the rest of the handler.
      const stdout = child.stdout;
      const stderr = child.stderr;
      if (!stdout || !stderr) {
        safeEnqueue(
          sseEvent("stderr", {
            line: "[fatal] sqlmap stdio pipes unavailable",
            timestamp: Date.now(),
          }),
        );
        safeEnqueue(
          sseEvent("exit", { scanId, code: -1, signal: null, timestamp: Date.now() }),
        );
        try { controller.close(); } catch { /* noop */ }
        return;
      }

      registerScan({
        id: scanId,
        process: child,
        startedAt: Date.now(),
        target: body.target,
      });

      // Line-buffered piping so SSE events align to whole lines.
      // We split on CRLF, LF, *and* lone CR — sqlmap uses bare CR for
      // in-place progress redraws, and treating those as line terminators
      // is the only way the SSE consumer sees progress incrementally.
      const pipe = (
        source: NodeJS.ReadableStream,
        eventName: "stdout" | "stderr",
      ): void => {
        let buf = "";
        source.setEncoding("utf8");
        source.on("data", (chunk: string) => {
          buf += chunk;
          const lines = buf.split(/\r\n|\n|\r/);
          buf = lines.pop() ?? "";
          for (const line of lines) {
            safeEnqueue(sseEvent(eventName, { line, timestamp: Date.now() }));
          }
          // Defensive cap: if a single unterminated line balloons past the
          // cap, flush a truncated chunk and emit a marker so the consumer
          // knows it's not a clean line.
          if (buf.length > LINE_BUFFER_CAP) {
            safeEnqueue(
              sseEvent(eventName, {
                line: buf.slice(0, LINE_BUFFER_CAP),
                timestamp: Date.now(),
              }),
            );
            safeEnqueue(
              sseEvent(eventName, {
                line: "[buffer truncated]",
                timestamp: Date.now(),
              }),
            );
            buf = "";
          }
        });
        source.on("end", () => {
          if (buf.length > 0) {
            safeEnqueue(sseEvent(eventName, { line: buf, timestamp: Date.now() }));
            buf = "";
          }
        });
      };

      pipe(stdout, "stdout");
      pipe(stderr, "stderr");

      child.on("error", (err) => {
        safeEnqueue(
          sseEvent("stderr", {
            line: `[spawn error] ${err.message}`,
            timestamp: Date.now(),
          }),
        );
      });

      // Timer for the escalated SIGKILL after an abort — captured so we can
      // clear it on natural exit and avoid hitting a long-dead PID.
      let killTimer: ReturnType<typeof setTimeout> | null = null;
      // Track the abort listener so we can detach it on close — defense in
      // depth, even though it's already `{ once: true }`.
      let onAbort: (() => void) | null = null;

      child.on("close", (code, signal) => {
        if (killTimer !== null) {
          clearTimeout(killTimer);
          killTimer = null;
        }
        if (onAbort !== null) {
          try {
            req.signal.removeEventListener("abort", onAbort);
          } catch {
            // ignore — signal may already be detached
          }
          onAbort = null;
        }
        safeEnqueue(
          sseEvent("exit", {
            scanId,
            code,
            signal,
            timestamp: Date.now(),
          }),
        );
        removeScan(scanId);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      });

      // If the client disconnects, signal the process and reap state.
      onAbort = (): void => {
        if (child.exitCode === null && !child.killed) {
          try {
            child.kill("SIGTERM");
          } catch {
            // race with natural exit — ignore
          }
          killTimer = setTimeout(() => {
            killTimer = null;
            if (child.exitCode === null && !child.killed) {
              try {
                child.kill("SIGKILL");
              } catch {
                // race with natural exit — ignore
              }
            }
          }, 2000);
        }
        removeScan(scanId);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      };
      req.signal.addEventListener("abort", onAbort, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Scan-Id": scanId,
    },
  });
}
