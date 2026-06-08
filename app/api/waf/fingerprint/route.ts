import { NextResponse, type NextRequest } from "next/server";

import { detectWaf } from "@/lib/waf-signatures";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/waf/fingerprint
 *
 * Accepts a target URL and sends a benign probe request through
 * sqlmap's connection logic to fingerprint the WAF.
 *
 * For now this does a direct HTTP probe via Node's fetch and
 * analyzes the response. Future: pipe through sqlmap --check-waf.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { target: string };
  try {
    body = (await req.json()) as { target: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const target = body?.target?.trim();
  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json(
      { error: "valid target URL required" },
      { status: 400 },
    );
  }

  // Block SSRF: reject localhost / private IP ranges
  const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.0\.0\.0|::1|\[::1\]|169\.254\.)/i;
  try {
    const url = new URL(target);
    if (BLOCKED_HOSTS.test(url.hostname)) {
      return NextResponse.json(
        { error: "SSRF blocked: target must not be a local/private address" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "invalid URL format" }, { status: 400 });
  }

  // Send multiple probes with different payload types to trigger WAF
  const probes = [
    // 1. Clean request (baseline)
    target,
    // 2. SQL injection probe
    target.includes("?")
      ? `${target}&waf_test=' OR '1'='1`
      : `${target}?waf_test=' OR '1'='1`,
    // 3. XSS probe (some WAFs catch both)
    target.includes("?")
      ? `${target}&waf_test=<script>alert(1)</script>`
      : `${target}?waf_test=<script>alert(1)</script>`,
    // 4. Path traversal probe
    target.includes("?")
      ? `${target}&waf_test=../../../etc/passwd`
      : `${target}?waf_test=../../../etc/passwd`,
  ];

  const results: Array<{
    probe: number;
    status: number;
    headers: Record<string, string>;
    bodySnippet: string;
    setCookie?: string[];
  }> = [];

  for (let i = 0; i < probes.length; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(probes[i], {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        signal: controller.signal,
        redirect: "manual",
      });

      clearTimeout(timeout);

      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });

      const bodyText = await res.text();
      const setCookie = res.headers.getSetCookie?.() ?? [];

      results.push({
        probe: i,
        status: res.status,
        headers,
        bodySnippet: bodyText.slice(0, 2000),
        setCookie: setCookie.length > 0 ? setCookie : undefined,
      });
    } catch (err) {
      results.push({
        probe: i,
        status: -1,
        headers: {},
        bodySnippet: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Analyze the first blocked response (non-2xx, non-3xx)
  const blocked = results.find(
    (r) => r.status >= 400 || r.status === -1,
  );

  if (!blocked || blocked.probe === 0) {
    return NextResponse.json({
      detected: false,
      target,
      message:
        "No WAF detected — all probes returned normal responses or target is unreachable.",
    });
  }

  const detection = detectWaf({
    status: blocked.status,
    headers: blocked.headers,
    body: blocked.bodySnippet,
    setCookie: blocked.setCookie,
  });

  return NextResponse.json({
    ...detection,
    target,
    blockedProbe: blocked.probe,
    blockStatus: blocked.status,
  });
}
