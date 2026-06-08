import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const proxy = process.env.LEAK_PROXY ?? null;
  return NextResponse.json({ proxy });
}
