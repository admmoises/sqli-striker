"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { QueueItem, QueueItemStatus } from "@/lib/queue-manager";

interface QueueState {
  queue: QueueItem[];
  stats: {
    total: number;
    queued: number;
    running: number;
    done: number;
    failed: number;
    activeCount: number;
    maxConcurrency: number;
    paused: boolean;
  };
}

const STATUS_COLORS: Record<QueueItemStatus, string> = {
  queued: "text-ash",
  running: "text-blood-neon animate-pulse-red",
  done: "text-green-400",
  failed: "text-red-400",
  aborted: "text-yellow-400",
  rate_limited: "text-yellow-400",
};

const STATUS_LABELS: Record<QueueItemStatus, string> = {
  queued: "QUEUED",
  running: "RUNNING",
  done: "DONE",
  failed: "FAILED",
  aborted: "ABORTED",
  rate_limited: "RATE LIMITED",
};

interface Props {
  onRunItem: (item: QueueItem) => void;
  currentScanId: string | null;
  isLive: boolean;
}

export function QueuePanel({
  onRunItem,
  currentScanId,
  isLive,
}: Props): React.ReactElement {
  const t = useT();
  const [state, setState] = useState<QueueState | null>(null);
  const [targetInput, setTargetInput] = useState("");
  const [batchInput, setBatchInput] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [concurrency, setConcurrency] = useState(3);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const r = await fetch("/api/queue");
      const j = (await r.json()) as QueueState;
      setState(j);
    } catch {
      // best effort
    }
  }, []);

  useEffect(() => {
    fetchQueue();
    pollRef.current = setInterval(fetchQueue, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchQueue]);

  const addSingle = useCallback(async () => {
    const target = targetInput.trim();
    if (!target) return;
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", target }),
      });
      setTargetInput("");
      fetchQueue();
      toast.success("Target added to queue");
    } catch {
      toast.error("Failed to add target");
    }
  }, [targetInput, fetchQueue]);

  const addBatch = useCallback(async () => {
    const targets = batchInput
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (targets.length === 0) return;
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "batch", targets }),
      });
      setBatchInput("");
      setShowBatch(false);
      fetchQueue();
      toast.success(`${targets.length} targets added to queue`);
    } catch {
      toast.error("Failed to add targets");
    }
  }, [batchInput, fetchQueue]);

  const removeItem = useCallback(
    async (id: string) => {
      try {
        await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "remove", id }),
        });
        fetchQueue();
      } catch {
        // ignore
      }
    },
    [fetchQueue],
  );

  const clearAll = useCallback(async () => {
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear" }),
      });
      fetchQueue();
    } catch {
      // ignore
    }
  }, [fetchQueue]);

  const setConc = useCallback(
    async (n: number) => {
      setConcurrency(n);
      try {
        await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "concurrency", concurrency: n }),
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const pauseQueue = useCallback(async () => {
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause" }),
      });
      fetchQueue();
    } catch {
      // ignore
    }
  }, [fetchQueue]);

  const resumeQueue = useCallback(async () => {
    try {
      await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resume" }),
      });
      fetchQueue();
    } catch {
      // ignore
    }
  }, [fetchQueue]);

  const items = state?.queue ?? [];
  const stats = state?.stats;

  return (
    <div className="space-y-3">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-display tracking-wider text-bone uppercase">
          <span className="text-blood">▍</span> Queue
        </div>
        {stats && (
          <div className="flex gap-2 text-[10px] font-mono tracking-wider">
            <span className="text-ash">{stats.queued} queued</span>
            <span className="text-blood-neon">{stats.running} running</span>
            <span className="text-green-400">{stats.done} done</span>
            {stats.failed > 0 && (
              <span className="text-red-400">{stats.failed} failed</span>
            )}
          </div>
        )}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={targetInput}
          onChange={(e) => setTargetInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addSingle()}
          placeholder="http://target.tld/page.php?id=1"
          className="flex-1 bg-void border border-blood-deep/50 px-3 py-2 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood focus:outline-none"
        />
        <button
          type="button"
          onClick={addSingle}
          className="border border-blood-deep/50 px-3 py-2 font-mono text-xs text-blood hover:text-blood-neon hover:border-blood transition-colors"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setShowBatch(!showBatch)}
          className={cn(
            "border px-3 py-2 font-mono text-xs transition-colors",
            showBatch
              ? "border-blood text-blood-neon"
              : "border-blood-deep/50 text-ash hover:text-blood-neon hover:border-blood",
          )}
        >
          Batch
        </button>
      </div>

      {/* Batch textarea */}
      <AnimatePresence>
        {showBatch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-2"
          >
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              placeholder="http://target1.com/page.php?id=1&#10;http://target2.com/page.php?id=1&#10;http://target3.com/page.php?id=1"
              rows={4}
              className="w-full bg-void border border-blood-deep/50 px-3 py-2 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood focus:outline-none resize-none"
            />
            <button
              type="button"
              onClick={addBatch}
              className="w-full border border-blood-deep/50 px-3 py-1.5 font-mono text-xs text-blood hover:text-blood-neon hover:border-blood transition-colors"
            >
              Add {batchInput.split("\n").filter((s) => s.trim()).length} targets
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls */}
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-ash uppercase tracking-wider">Concurrency:</span>
        {[1, 2, 3, 5, 10].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setConc(n)}
            className={cn(
              "px-1.5 py-0.5 border transition-colors",
              concurrency === n
                ? "border-blood text-blood-neon bg-blood/10"
                : "border-blood-deep/30 text-ash hover:text-blood",
            )}
          >
            {n}
          </button>
        ))}
        <span className="ml-auto">
          {stats?.paused ? (
            <button
              type="button"
              onClick={resumeQueue}
              className="text-blood-neon border border-blood/50 px-2 py-0.5 hover:bg-blood/10"
            >
              RESUME
            </button>
          ) : (
            <button
              type="button"
              onClick={pauseQueue}
              className="text-ash border border-blood-deep/30 px-2 py-0.5 hover:text-blood"
            >
              PAUSE
            </button>
          )}
        </span>
      </div>

      {/* Queue list */}
      <div className="max-h-[300px] overflow-y-auto border border-blood-deep/30 bg-void/40">
        {items.length === 0 ? (
          <div className="p-4 text-center text-xs font-mono text-ash-dim">
            Queue empty — add targets above
          </div>
        ) : (
          items.map((item) => {
            const isCurrentScan = currentScanId === item.scanId;
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 border-b border-blood-deep/20 font-mono text-[11px]",
                  isCurrentScan && "bg-blood/10",
                )}
              >
                {/* Status dot */}
                <span
                  className={cn(
                    "inline-block w-1.5 h-1.5 rounded-full flex-shrink-0",
                    item.status === "running" && "bg-blood-neon",
                    item.status === "done" && "bg-green-400",
                    item.status === "failed" && "bg-red-400",
                    item.status === "queued" && "bg-ash-dim",
                    item.status === "aborted" && "bg-yellow-400",
                    item.status === "rate_limited" && "bg-yellow-400",
                  )}
                />

                {/* Target URL */}
                <span className="flex-1 truncate text-bone-dim">
                  {item.target}
                </span>

                {/* Status */}
                <span
                  className={cn(
                    "text-[10px] flex-shrink-0",
                    STATUS_COLORS[item.status],
                  )}
                >
                  {STATUS_LABELS[item.status]}
                </span>

                {/* Actions */}
                {item.status === "queued" && !isLive && (
                  <button
                    type="button"
                    onClick={() => onRunItem(item)}
                    className="text-[10px] text-blood hover:text-blood-neon flex-shrink-0"
                  >
                    RUN
                  </button>
                )}
                {item.status !== "running" && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-[10px] text-ash-dim hover:text-red-400 flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {items.length > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="w-full border border-blood-deep/30 px-3 py-1 font-mono text-[10px] text-ash-dim hover:text-red-400 hover:border-red-400/50 transition-colors"
        >
          Clear queue
        </button>
      )}
    </div>
  );
}
