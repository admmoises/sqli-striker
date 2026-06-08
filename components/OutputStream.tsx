"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { LogLine, ScanState } from "@/lib/use-scan";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  state: ScanState;
  onClear: () => void;
}

// Strip ANSI escape codes (CSI + a few other sequences).
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g;

const stripAnsi = (s: string): string => s.replace(ANSI_RE, "");

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
const fmtTime = (ts: number): string => {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};
const fmtElapsed = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
};

const abbreviateId = (id: string | null): string => {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id;
};

export function OutputStream({ state, onClear }: Props): React.ReactElement {
  const t = useT();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const live = state.status === "scanning" || state.status === "starting";

  // After lines change, scroll to bottom if user hasn't manually scrolled up.
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollerRef.current;
    if (!el) return;
    // requestAnimationFrame so layout settles before scroll.
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [state.lines, autoScroll]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom !== autoScroll) setAutoScroll(atBottom);
  };

  // Render only the last 500 lines unless user scrolled up — keeps DOM small.
  const visibleLines: LogLine[] = useMemo(() => {
    if (autoScroll && state.lines.length > 500) {
      return state.lines.slice(state.lines.length - 500);
    }
    return state.lines;
  }, [state.lines, autoScroll]);

  const exitBanner = useMemo(() => {
    if (state.exitCode === null && !state.exitSignal) return null;
    return `── exit: code ${state.exitCode ?? "—"} signal ${state.exitSignal ?? "—"} ──`;
  }, [state.exitCode, state.exitSignal]);

  const copyAll = async (): Promise<void> => {
    try {
      const txt = state.lines
        .map((l) => `[${fmtTime(l.ts)}] ${stripAnsi(l.text)}`)
        .join("\n");
      await navigator.clipboard.writeText(txt);
      toast.success(t("toast.copied"), { duration: 1500 });
    } catch {
      toast.error(t("toast.clipboardError"));
    }
  };

  const download = (): void => {
    const txt = state.lines
      .map((l) => `[${fmtTime(l.ts)}] ${stripAnsi(l.text)}`)
      .join("\n");
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sqlmap-${state.scanId?.slice(0, 8) ?? "log"}-${Date.now()}.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between mb-1 px-1 gap-2 flex-wrap">
        <div className="text-sm tracking-wider text-bone font-mono font-medium">
          <span className="text-blood">▍</span> {t("stdout.title")}
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-ash">
            {t("output.scanId")} <span className="text-blood">::</span>{" "}
            <span className="text-bone">{abbreviateId(state.scanId)}</span>
          </span>
          <span className="text-ash">
            {t("output.elapsed")} <span className="text-blood">::</span>{" "}
            <span className="text-bone">{fmtElapsed(state.elapsedMs)}</span>
          </span>
        </div>
      </div>
      <div className="divider-x mb-2" />

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        // aria-live intentionally OFF here — announcing every sqlmap line
        // through a screen reader is hostile UX. A sibling sr-only live
        // region in ControlPanel announces terminal scan transitions only.
        aria-live="off"
        className="relative flex-1 min-h-0 overflow-y-auto bg-void/80 border border-blood-deep/40 p-3 font-mono text-sm leading-relaxed scanlines"
      >
        {state.error && (
          <div className="text-blood border border-blood/60 bg-blood/10 p-2 mb-2 leading-relaxed">
            ! {state.error}
          </div>
        )}
        {state.lines.length === 0 && !state.error && (
          <div className="text-ash text-center pt-8 select-none">
            <pre className="inline-block text-left text-blood-deep/50 leading-tight">
{`     ┌─────────────────────────┐
     │   ⟁  ${t("output.awaitingBanner").toUpperCase().padEnd(15, " ")}  ⟁ │
     └─────────────────────────┘`}
            </pre>
            <div className="mt-3 text-sm text-ash tracking-wider">
              {t("output.awaiting")}
            </div>
          </div>
        )}
        {visibleLines.map((l) => (
          <div
            key={l.id}
            className={cn(
              "whitespace-pre-wrap break-words",
              l.err ? "text-blood" : "text-bone",
            )}
          >
            <span className="text-ash select-none">[{fmtTime(l.ts)}]</span>{" "}
            <span>{stripAnsi(l.text)}</span>
          </div>
        ))}
        {live && (
          <div className="text-blood">
            <span className="cursor-blink">{">"}</span>
          </div>
        )}
        {exitBanner && (
          <div
            className={cn(
              "mt-2 py-1.5 text-center font-display tracking-wider text-base border leading-relaxed",
              state.exitCode === 0
                ? "text-blood-neon border-blood-neon bg-blood/10 glow-red-soft"
                : "text-blood border-blood bg-blood/20 glow-red",
            )}
          >
            {exitBanner}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={onClear}
            disabled={state.lines.length === 0}
            className="text-xs tracking-wider px-2.5 py-1.5 border border-blood-deep/60 text-bone-dim hover:border-blood hover:text-blood disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
          >
            {t("output.clear")}
          </button>
          <button
            type="button"
            onClick={copyAll}
            disabled={state.lines.length === 0}
            className="text-xs tracking-wider px-2.5 py-1.5 border border-blood-deep/60 text-bone-dim hover:border-blood hover:text-blood disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
          >
            {t("output.copy")}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={state.lines.length === 0}
            className="text-xs tracking-wider px-2.5 py-1.5 border border-blood-deep/60 text-bone-dim hover:border-blood hover:text-blood disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
          >
            {t("output.download")}
          </button>
        </div>
        {!autoScroll && (
          <button
            type="button"
            onClick={() => setAutoScroll(true)}
            className="text-xs tracking-wider px-2.5 py-1.5 border border-blood text-blood bg-blood/10 hover:bg-blood/20 transition-colors animate-pulse-red font-mono"
          >
            ▼ {t("output.scrollToBottom")}
          </button>
        )}
        <span className="text-xs font-mono text-ash">
          {t("output.lines")} <span className="text-blood">::</span>{" "}
          <span className="text-bone">{state.lines.length}</span>
        </span>
      </div>
    </div>
  );
}
