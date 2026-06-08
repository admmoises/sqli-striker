import { NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { SQLMAP_TAMPER_DIR } from "@/lib/sqlmap-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface TamperInfo {
  name: string;
  description: string;
}

interface TamperResponse {
  dir: string;
  count: number;
  tampers: TamperInfo[];
  error?: string;
}

/**
 * Extracts the description from a tamper file's `def tamper()` docstring.
 * Falls back to the top-level module docstring, then to an empty string.
 */
function extractDescription(source: string): string {
  // Match the def tamper(...) function and its triple-quoted docstring.
  const tamperFnMatch = source.match(
    /def\s+tamper\s*\([^)]*\)\s*:\s*(?:\r?\n\s*)+"""([\s\S]*?)"""/,
  );
  if (tamperFnMatch) {
    const body = tamperFnMatch[1];
    const firstLine = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (firstLine) return firstLine;
  }

  // Fall back to the first module-level triple-quoted block that isn't a copyright header.
  const moduleDocstrings = source.match(/"""([\s\S]*?)"""/g);
  if (moduleDocstrings) {
    for (const block of moduleDocstrings) {
      const inner = block.slice(3, -3).trim();
      if (inner && !/copyright/i.test(inner)) {
        const firstLine = inner.split(/\r?\n/)[0].trim();
        if (firstLine) return firstLine;
      }
    }
  }

  return "";
}

export async function GET(): Promise<NextResponse<TamperResponse>> {
  const dir = SQLMAP_TAMPER_DIR;

  if (!existsSync(dir)) {
    return NextResponse.json({
      dir,
      count: 0,
      tampers: [],
      error: `Tamper directory not found: ${dir}`,
    });
  }

  try {
    const entries = await readdir(dir);
    const pyFiles = entries
      .filter((f) => f.endsWith(".py") && !f.startsWith("__"))
      .sort((a, b) => a.localeCompare(b));

    const tampers = await Promise.all(
      pyFiles.map(async (file): Promise<TamperInfo> => {
        const name = file.replace(/\.py$/, "");
        try {
          const source = await readFile(join(dir, file), "utf8");
          return { name, description: extractDescription(source) };
        } catch {
          return { name, description: "" };
        }
      }),
    );

    return NextResponse.json({
      dir,
      count: tampers.length,
      tampers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      dir,
      count: 0,
      tampers: [],
      error: message,
    });
  }
}
