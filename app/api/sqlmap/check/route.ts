import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";

import { SQLMAP_BIN, SQLMAP_TAMPER_DIR } from "@/lib/sqlmap-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

interface CheckResponse {
  installed: boolean;
  version: string;
  path: string;
  tamperDir: string;
  tamperDirExists: boolean;
  error?: string;
}

export async function GET(): Promise<NextResponse<CheckResponse>> {
  const path = SQLMAP_BIN;
  const tamperDir = SQLMAP_TAMPER_DIR;
  const tamperDirExists = existsSync(tamperDir);

  if (!existsSync(path)) {
    return NextResponse.json({
      installed: false,
      version: "",
      path,
      tamperDir,
      tamperDirExists,
      error: `sqlmap binary not found at ${path}`,
    });
  }

  try {
    const { stdout } = await execFileAsync(path, ["--version"], {
      timeout: 5000,
    });
    const version = stdout.trim().split(/\s+/).pop() ?? stdout.trim();
    return NextResponse.json({
      installed: true,
      version,
      path,
      tamperDir,
      tamperDirExists,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      installed: false,
      version: "",
      path,
      tamperDir,
      tamperDirExists,
      error: message,
    });
  }
}
