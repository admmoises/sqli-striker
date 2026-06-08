import { NextResponse, type NextRequest } from "next/server";

import { LEAK_WORDLIST, type LeakWordlistEntry } from "@/lib/leak-wordlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const categories = [...new Set(LEAK_WORDLIST.map((e) => e.category))];
  return NextResponse.json({
    totalEntries: LEAK_WORDLIST.length,
    categories,
    entries: LEAK_WORDLIST.map((e) => ({ path: e.path, category: e.category, severity: e.severity })),
  });
}
