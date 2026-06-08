import { NextResponse, type NextRequest } from "next/server";
import { spawn, type ChildProcess } from "node:child_process";

import { SQLMAP_BIN } from "@/lib/sqlmap-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface TamperTestResult {
  name: string;
  passed: boolean;
  blocked: boolean;
  error: string | null;
  durationMs: number;
}

/**
 * POST /api/waf/tamper-test
 *
 * Tests each tamper script individually against a target to determine
 * which tampers bypass the WAF. Uses sqlmap's --tamper flag with a
 * single tamper at a time, running a lightweight --level=1 --risk=1
 * scan that exits early on first detection or all tests exhausted.
 *
 * We pass --smart and low threads to be gentle on the target while
 * testing multiple tampers sequentially.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { target: string; tampers: string[] };
  try {
    body = (await req.json()) as { target: string; tampers: string[] };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const target = body?.target?.trim();
  const tampers = body?.tampers ?? [];

  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json(
      { error: "valid target URL required" },
      { status: 400 },
    );
  }

  if (!Array.isArray(tampers) || tampers.length === 0) {
    return NextResponse.json(
      { error: "tampers array required" },
      { status: 400 },
    );
  }

  const results: TamperTestResult[] = [];

  for (const tamper of tampers) {
    const start = Date.now();
    const result: TamperTestResult = {
      name: tamper,
      passed: false,
      blocked: false,
      error: null,
      durationMs: 0,
    };

    try {
      const output = await runTamperTest(target, tamper);
      result.durationMs = Date.now() - start;

      // Parse output to determine if it was blocked or passed
      const combined = output.toLowerCase();

      // Signs the tamper worked (payloads got through and were tested)
      const passedMarkers = [
        "identified the following injection point",
        "the back-end dbms is",
        "sqlmap identified the following injection",
        "heuristic (parsing) test showed",
        "got a refresh",
        "do you want to exploit",
        "sqlmap resumed",
        "testing for sql injection",
      ];

      // Signs the WAF blocked us
      const blockedMarkers = [
        "waf/ips identified",
        "connection timed out",
        "the target url is not valid",
        "unable to connect",
        "403 forbidden",
        "406 not acceptable",
        "429 too many requests",
        "waf block",
        "attention required",
        "access denied",
        "blocked",
        "captcha",
      ];

      const passed = passedMarkers.some((m) => combined.includes(m));
      const blocked = blockedMarkers.some((m) => combined.includes(m));

      if (passed && !blocked) {
        result.passed = true;
      } else if (blocked) {
        result.blocked = true;
      }
      // If neither, it's inconclusive — leave both false
    } catch (err) {
      result.durationMs = Date.now() - start;
      result.error = err instanceof Error ? err.message : String(err);
    }

    results.push(result);
  }

  // Sort: passed first, then blocked, then inconclusive
  results.sort((a, b) => {
    if (a.passed && !b.passed) return -1;
    if (!a.passed && b.passed) return 1;
    if (a.blocked && !b.blocked) return 1;
    if (!a.blocked && b.blocked) return -1;
    return a.durationMs - b.durationMs;
  });

  return NextResponse.json({
    target,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      blocked: results.filter((r) => r.blocked).length,
      inconclusive: results.filter((r) => !r.passed && !r.blocked).length,
    },
  });
}

function runTamperTest(target: string, tamper: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-u",
      target,
      `--tamper=${tamper}`,
      "--batch",
      "--level=1",
      "--risk=1",
      "--threads=1",
      "--timeout=10",
      "--retries=0",
      "--disable-coloring",
      "--flush-session",
      "--smart",
      // Exit after first detection, don't enumerate
      "--technique=B",
      "--test-filter=1=1",
      "--answers=follow=N",
    ];

    const child = spawn(SQLMAP_BIN, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: process.env.LANG ?? "en_US.UTF-8",
        PYTHONUNBUFFERED: "1",
        NODE_ENV: process.env.NODE_ENV ?? "development",
      } as NodeJS.ProcessEnv,
    }) as ChildProcess;

    const stdout = child.stdout;
    const stderr = child.stderr;
    if (!stdout || !stderr) {
      reject(new Error("stdio pipes unavailable"));
      return;
    }

    let out = "";
    let errOut = "";

    stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });

    stderr.on("data", (chunk: Buffer) => {
      errOut += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000);
      resolve(out + "\n" + errOut + "\n[TIMEOUT after 15s]");
    }, 15000);

    child.on("close", () => {
      clearTimeout(timer);
      resolve(out + "\n" + errOut);
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
