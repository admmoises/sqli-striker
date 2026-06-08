import { NextResponse, type NextRequest } from "next/server";
import {
  addBatch,
  addToQueue,
  clearQueue,
  getQueue,
  getStats,
  removeItem,
  setConcurrency,
  setPaused,
} from "@/lib/queue-manager";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    queue: getQueue(),
    stats: getStats(),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: {
    action?: string;
    targets?: string[];
    config?: Record<string, unknown>;
    scheduledAt?: number | null;
    target?: string;
    id?: string;
    concurrency?: number;
    paused?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const action = body.action ?? "add";

  switch (action) {
    case "add": {
      if (body.target) {
        const item = addToQueue(body.target, body.config ?? {}, body.scheduledAt ?? null);
        return NextResponse.json({ item, stats: getStats() });
      }
      return NextResponse.json(
        { error: "target is required for add action" },
        { status: 400 },
      );
    }

    case "batch": {
      if (!body.targets || !Array.isArray(body.targets)) {
        return NextResponse.json(
          { error: "targets array is required for batch action" },
          { status: 400 },
        );
      }
      const items = addBatch(body.targets, body.config ?? {});
      return NextResponse.json({ items, stats: getStats() });
    }

    case "remove": {
      if (!body.id) {
        return NextResponse.json(
          { error: "id is required for remove action" },
          { status: 400 },
        );
      }
      removeItem(body.id);
      return NextResponse.json({ ok: true, stats: getStats() });
    }

    case "clear": {
      clearQueue();
      return NextResponse.json({ ok: true, stats: getStats() });
    }

    case "concurrency": {
      if (typeof body.concurrency !== "number") {
        return NextResponse.json(
          { error: "concurrency is required" },
          { status: 400 },
        );
      }
      setConcurrency(body.concurrency);
      return NextResponse.json({ stats: getStats() });
    }

    case "pause": {
      setPaused(true);
      return NextResponse.json({ stats: getStats() });
    }

    case "resume": {
      setPaused(false);
      return NextResponse.json({ stats: getStats() });
    }

    default:
      return NextResponse.json(
        { error: `unknown action: ${action}` },
        { status: 400 },
      );
  }
}
