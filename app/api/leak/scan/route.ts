import { type NextRequest } from "next/server";

import { LEAK_WORDLIST, type LeakWordlistEntry } from "@/lib/leak-wordlist";
import { expandTargets, expandPorts } from "@/lib/ip-range";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTTP_TIMEOUT_MS = 4000;
const MAX_BODY_SNIPPET = 400;

interface ScanRequest {
  targets: string;       // IPs, CIDRs, or hostnames (newline/comma separated)
  ports: string;         // ports (comma, dash-range)
  concurrency: number;   // max parallel requests
  protocols: string[];   // ["http", "https"] or subset
  paths?: string[];      // custom paths override — if empty, use full wordlist
  categories?: string[]; // filter wordlist by category
  severities?: string[]; // filter by severity
}

interface ScanResult {
  target: string;
  port: number;
  protocol: string;
  path: string;
  status: number;
  contentLength: number | null;
  snippet: string | null;
  entry: LeakWordlistEntry;
  durationMs: number;
}

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

  const targetsRaw = body.targets?.trim();
  if (!targetsRaw) {
    return new Response(
      JSON.stringify({ error: "targets required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Expand IPs + ports
  let ips: string[];
  let ports: number[];
  try {
    ips = expandTargets(targetsRaw);
    ports = expandPorts(body.ports || "80,443");
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "invalid input" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Filter wordlist
  let entries = LEAK_WORDLIST;
  if (body.paths && body.paths.length > 0) {
    entries = body.paths.map((p) => ({
      path: p.startsWith("/") ? p : `/${p}`,
      category: "Custom",
      severity: "info" as const,
      description: "Custom path",
    }));
  }
  if (body.categories && body.categories.length > 0) {
    entries = entries.filter((e) => body.categories!.includes(e.category));
  }
  if (body.severities && body.severities.length > 0) {
    entries = entries.filter((e) => body.severities!.includes(e.severity));
  }

  const protocols = body.protocols?.length ? body.protocols : ["http", "https"];
  const concurrency = Math.max(1, Math.min(body.concurrency || 20, 100));

  // Build the full scan matrix
  const scanTargets: Array<{ ip: string; port: number; protocol: string }> = [];
  for (const ip of ips) {
    for (const port of ports) {
      for (const proto of protocols) {
        scanTargets.push({ ip, port, protocol: proto });
      }
    }
  }

  const totalScans = scanTargets.length * entries.length;

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const enqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      enqueue(
        sseEvent("meta", {
          targets: ips.length,
          ports: ports.length,
          entries: entries.length,
          totalScans,
          startedAt: Date.now(),
        }),
      );

      let completed = 0;
      let found = 0;
      let aborted = false;

      req.signal.addEventListener(
        "abort",
        () => {
          aborted = true;
        },
        { once: true },
      );

      // Concurrency-limited queue
      const queue = [...scanTargets];
      const active = new Set<Promise<void>>();

      async function processTarget(t: { ip: string; port: number; protocol: string }): Promise<void> {
        const baseUrl = `${t.protocol}://${t.ip}:${t.port}`;

        for (const entry of entries) {
          if (aborted) break;

          const url = `${baseUrl}${entry.path}`;
          const start = Date.now();

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

            const res = await fetch(url, {
              method: "GET",
              headers: {
                "User-Agent": "SQLI-Striker/0.2 LeakScanner",
                Accept: "*/*",
              },
              signal: controller.signal,
              redirect: "manual",
            });

            clearTimeout(timer);

            const expectedCodes = entry.statusCodes || [200];
            const status = res.status;

            if (expectedCodes.includes(status)) {
              const bodyText = await res.text().catch(() => "");
              const contentLength =
                parseInt(res.headers.get("content-length") || "", 10) || bodyText.length;

              // Check match patterns if specified
              let matched = true;
              if (entry.matchPatterns && entry.matchPatterns.length > 0) {
                matched = entry.matchPatterns.some((p) => {
                  try {
                    return new RegExp(p, "i").test(bodyText);
                  } catch {
                    return bodyText.toLowerCase().includes(p.toLowerCase());
                  }
                });
              }

              if (matched) {
                found++;
                const result: ScanResult = {
                  target: t.ip,
                  port: t.port,
                  protocol: t.protocol,
                  path: entry.path,
                  status,
                  contentLength,
                  snippet: bodyText.slice(0, MAX_BODY_SNIPPET) || null,
                  entry: {
                    path: entry.path,
                    category: entry.category,
                    severity: entry.severity,
                    description: entry.description,
                  },
                  durationMs: Date.now() - start,
                };
                enqueue(sseEvent("found", result));
              }
            }

            // For non-200 but interesting status codes (401, 403)
            // report them as info-level finds
            if (status === 401 || status === 403) {
              const result: ScanResult = {
                target: t.ip,
                port: t.port,
                protocol: t.protocol,
                path: entry.path,
                status,
                contentLength: parseInt(res.headers.get("content-length") || "0", 10) || null,
                snippet: null,
                entry: {
                  path: entry.path,
                  category: entry.category,
                  severity: "info",
                  description: `${entry.description} [auth required: ${status}]`,
                },
                durationMs: Date.now() - start,
              };
              enqueue(sseEvent("found", result));
            }
          } catch {
            // Timeouts, connection refused — not a leak, skip silently
          }
        }

        completed++;
        enqueue(sseEvent("progress", { completed, total: scanTargets.length, found }));
      }

      // Pump the queue
      async function pump(): Promise<void> {
        while (queue.length > 0 && !aborted) {
          while (active.size >= concurrency && !aborted) {
            await Promise.race(active);
          }
          if (aborted) break;

          const next = queue.shift()!;
          const promise = processTarget(next).finally(() => {
            active.delete(promise);
          });
          active.add(promise);
        }

        // Wait for remaining
        await Promise.all(Array.from(active));

        if (!closed) {
          enqueue(
            sseEvent("done", {
              completed,
              total: scanTargets.length,
              found,
              aborted,
              endedAt: Date.now(),
            }),
          );
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }

      pump().catch(() => {
        // pump errors — usually from abort
      });
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
