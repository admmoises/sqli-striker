import { type NextRequest } from "next/server";
import { spawn } from "node:child_process";

import { SQLMAP_BIN } from "@/lib/sqlmap-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_ENV: readonly string[] = ["PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "TERM"];

export async function POST(req: NextRequest): Promise<Response> {
  let body: { args?: string[] };
  try {
    body = (await req.json()) as { args?: string[] };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!body.args || !Array.isArray(body.args) || body.args.length === 0) {
    return Response.json({ error: "args array required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const enq = (chunk: string): void => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(chunk)); } catch { closed = true; }
      };

      const childEnv: Record<string, string> = { PYTHONUNBUFFERED: "1" };
      for (const k of ALLOWED_ENV) {
        const v = process.env[k];
        if (typeof v === "string" && v.length > 0) childEnv[k] = v;
      }

      const child = spawn(SQLMAP_BIN, body.args!, {
        stdio: ["ignore", "pipe", "pipe"],
        env: childEnv as NodeJS.ProcessEnv,
      });

      const pipe = (source: NodeJS.ReadableStream): void => {
        let buf = "";
        source.setEncoding("utf8");
        source.on("data", (chunk: string) => {
          buf += chunk;
          const lines = buf.split(/\r\n|\n|\r/);
          buf = lines.pop() ?? "";
          for (const line of lines) enq(line + "\n");
        });
        source.on("end", () => {
          if (buf.length > 0) enq(buf + "\n");
        });
      };

      const out = child.stdout;
      const err = child.stderr;
      if (!out || !err) {
        enq("[fatal] stdio pipes unavailable\n");
        try { controller.close(); } catch { /* noop */ }
        return;
      }

      pipe(out);
      pipe(err);

      child.on("error", (e) => {
        enq(`[spawn error] ${e.message}\n`);
      });

      let killTimer: ReturnType<typeof setTimeout> | null = null;

      child.on("close", () => {
        if (killTimer !== null) { clearTimeout(killTimer); killTimer = null; }
        if (!closed) { closed = true; try { controller.close(); } catch { /* noop */ } }
      });

      req.signal.addEventListener("abort", () => {
        if (child.exitCode === null && !child.killed) {
          try { child.kill("SIGTERM"); } catch { /* race */ }
          killTimer = setTimeout(() => {
            killTimer = null;
            if (child.exitCode === null && !child.killed) {
              try { child.kill("SIGKILL"); } catch { /* race */ }
            }
          }, 2000);
        }
        if (!closed) { closed = true; try { controller.close(); } catch { /* noop */ } }
      }, { once: true });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
