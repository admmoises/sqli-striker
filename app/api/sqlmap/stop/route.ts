import { NextResponse, type NextRequest } from "next/server";

import { getScan, removeScan } from "@/lib/scan-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface StopRequest {
  scanId: string;
}

interface StopResponse {
  stopped: boolean;
  scanId: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<StopResponse>> {
  let body: StopRequest;
  try {
    body = (await req.json()) as StopRequest;
  } catch {
    return NextResponse.json(
      { stopped: false, scanId: "", error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const scanId = body?.scanId;
  if (!scanId || typeof scanId !== "string") {
    return NextResponse.json(
      { stopped: false, scanId: "", error: "scanId is required" },
      { status: 400 },
    );
  }

  const scan = getScan(scanId);
  if (!scan) {
    return NextResponse.json(
      { stopped: false, scanId, error: "scan not found or already finished" },
      { status: 404 },
    );
  }

  const child = scan.process;

  if (child.exitCode !== null || child.killed) {
    removeScan(scanId);
    return NextResponse.json({ stopped: true, scanId });
  }

  // Graceful TERM, escalating to KILL after 2s if still alive.
  if (child.exitCode === null && !child.killed) {
    try {
      child.kill("SIGTERM");
    } catch {
      // ignore — race with natural exit
    }
  }

  const killed = await new Promise<boolean>((resolve) => {
    const killTimer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore — race with natural exit
        }
      }
      resolve(true);
    }, 2000);

    child.once("exit", () => {
      clearTimeout(killTimer);
      resolve(true);
    });
  });

  removeScan(scanId);
  return NextResponse.json({ stopped: killed, scanId });
}
