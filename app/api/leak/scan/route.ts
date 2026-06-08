import { type NextRequest } from "next/server";
import { HttpsProxyAgent } from "https-proxy-agent";

import { LEAK_WORDLIST, type LeakWordlistEntry } from "@/lib/leak-wordlist";
import { expandTargets, expandPorts } from "@/lib/ip-range";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HTTP_TIMEOUT_MS = 4000;
const MAX_BODY_SNIPPET = 400;

/** Rotating User-Agent pool — modern browsers across OSes */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0",
];

let uaIndex = 0;
function nextUserAgent(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length];
  uaIndex++;
  return ua;
}

/** Shuffle array in place (Fisher-Yates) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface ScanRequest {
  targets: string;
  ports: string;
  concurrency: number;
  protocols: string[];
  paths?: string[];
  categories?: string[];
  severities?: string[];
  proxy?: string;          // proxy URL e.g. http://127.0.0.1:8080
  delay?: number;          // ms between requests per target
  randomAgent?: boolean;   // rotate User-Agent per request
  randomize?: boolean;     // shuffle path order
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

// Proxy agent (created per-scan if proxy is set)
let proxyAgent: HttpsProxyAgent<string> | undefined;

function setProxy(proxyUrl: string): void {
  proxyAgent = new HttpsProxyAgent(proxyUrl);
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

  // SSRF guard
  const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1|\[::1\]|169\.254\.)/i;

  // Expand IPs + ports
  let ips: string[];
  let ports: number[];
  try {
    ips = expandTargets(targetsRaw);
    // Validate against SSRF
    for (const ip of ips) {
      try {
        const u = new URL(`http://${ip}`);
        if (BLOCKED_HOSTS.test(u.hostname)) {
          return new Response(
            JSON.stringify({ error: `SSRF blocked: ${ip} is a private address` }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }
      } catch {
        return new Response(
          JSON.stringify({ error: `Invalid target: ${ip}` }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    ports = expandPorts(body.ports || "80,443");
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "invalid input" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Proxy setup
  if (body.proxy) {
    try {
      setProxy(body.proxy);
    } catch {
      return new Response(
        JSON.stringify({ error: "invalid proxy URL" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
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

  // Randomize path order to evade pattern detection
  if (body.randomize !== false) {
    entries = shuffle([...entries]);
  }

  const protocols = body.protocols?.length ? body.protocols : ["http", "https"];
  const concurrency = Math.max(1, Math.min(body.concurrency || 20, 100));
  const delayMs = Math.max(0, Math.min(body.delay || 0, 5000));
  const useRandomAgent = body.randomAgent !== false; // default true

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
          proxy: !!body.proxy,
          randomAgent: useRandomAgent,
          delay: delayMs,
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

      const queue = [...scanTargets];
      const active = new Set<Promise<void>>();

      async function processTarget(t: { ip: string; port: number; protocol: string }): Promise<void> {
        const baseUrl = `${t.protocol}://${t.ip}:${t.port}`;

        for (const entry of entries) {
          if (aborted) break;

          // Per-request delay for stealth
          if (delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
          }

          const url = `${baseUrl}${entry.path}`;
          const start = Date.now();

          try {
            const headers: Record<string, string> = {
              Accept: "*/*",
              "Accept-Language": "en-US,en;q=0.9",
              "Cache-Control": "no-cache",
            };

            if (useRandomAgent) {
              headers["User-Agent"] = nextUserAgent();
            }

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

            // Build fetch options with optional proxy agent
            const fetchOpts: RequestInit & { agent?: unknown } = {
              method: "GET",
              headers,
              signal: controller.signal,
              redirect: "manual",
            };

            // Attach proxy agent if configured
            if (body.proxy && proxyAgent) {
              (fetchOpts as Record<string, unknown>).agent = proxyAgent;
            }

            const res = await fetch(url, fetchOpts);

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
            // Timeouts, connection refused — skip
          }
        }

        completed++;
        enqueue(sseEvent("progress", { completed, total: scanTargets.length, found }));
      }

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
        // pump errors
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
