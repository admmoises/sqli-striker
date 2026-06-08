"use client";

import { useEffect, useState } from "react";

import type { ScanState } from "@/lib/use-scan";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  state: ScanState;
  sqlmapVersion: string | null;
  sqlmapInstalled: boolean;
  torEnabled: boolean;
}

interface PerfMemory {
  usedJSHeapSize?: number;
  jsHeapSizeLimit?: number;
}

function getPerfMemory(): PerfMemory | null {
  if (typeof performance === "undefined") return null;
  const p = performance as Performance & { memory?: PerfMemory };
  return p.memory ?? null;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

export function StatusFooter({
  state,
  sqlmapVersion,
  sqlmapInstalled,
  torEnabled,
}: Props): React.ReactElement {
  const t = useT();
  const [startedAt] = useState(() => Date.now());
  const [uptime, setUptime] = useState(0);
  const [heap, setHeap] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setUptime(Date.now() - startedAt);
      const m = getPerfMemory();
      if (m && typeof m.usedJSHeapSize === "number" && typeof m.jsHeapSizeLimit === "number") {
        setHeap({ used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const live =
    state.status === "scanning" || state.status === "starting" || state.status === "stopping";

  const heapMb = heap ? (heap.used / (1024 * 1024)).toFixed(0) : null;
  const scanIdShort = state.scanId ? state.scanId.slice(0, 8) : "—";

  return (
    <footer className="border-t border-blood-deep/60 bg-void/80 backdrop-blur-sm">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-3 px-4 sm:px-6 py-2 text-xs tracking-wider text-ash font-mono">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block w-2 h-2",
              live
                ? "bg-blood animate-pulse-red"
                : state.status === "error"
                  ? "bg-blood"
                  : "bg-blood-deep",
            )}
          />
          <span className={cn(live ? "text-blood-neon" : "text-bone-dim")}>
            {live ? t("footer.active") : sqlmapInstalled ? t("footer.ready") : t("footer.offline")}
          </span>
        </div>
        <div className="truncate">
          <span className="text-bone-dim">{t("footer.sqlmap")} </span>
          <span className="text-blood">::</span>{" "}
          <span className={cn(sqlmapInstalled ? "text-bone" : "text-blood")}>
            {sqlmapVersion ?? "—"}
          </span>
        </div>
        <div className="truncate">
          <span className="text-bone-dim">{t("footer.scan")} </span>
          <span className="text-blood">::</span>{" "}
          <span className="text-bone">{scanIdShort}</span>
        </div>
        <div className="truncate">
          <span className="text-bone-dim">{t("footer.uptime")} </span>
          <span className="text-blood">::</span>{" "}
          <span className="text-bone">{fmtUptime(uptime)}</span>
        </div>
        <div className="truncate">
          {heapMb && (
            <>
              <span className="text-bone-dim">{t("footer.ram")} </span>
              <span className="text-blood">::</span>{" "}
              <span className="text-bone">{heapMb}m</span>
            </>
          )}
        </div>
        <div className="text-right truncate">
          {torEnabled && (
            <span className="text-blood">⟁ TOR</span>
          )}
        </div>
      </div>
    </footer>
  );
}
