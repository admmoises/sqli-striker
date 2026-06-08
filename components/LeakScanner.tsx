"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

interface WordlistEntry {
  path: string;
  category: string;
  severity: "critical" | "high" | "medium" | "info";
}

interface WordlistResponse {
  totalEntries: number;
  categories: string[];
  entries: WordlistEntry[];
}

interface ScanResult {
  target: string;
  port: number;
  protocol: string;
  path: string;
  status: number;
  contentLength: number | null;
  snippet: string | null;
  entry: {
    path: string;
    category: string;
    severity: "critical" | "high" | "medium" | "info";
    description: string;
  };
  durationMs: number;
}

interface MetaPayload {
  targets: number;
  ports: number;
  entries: number;
  totalScans: number;
  startedAt: number;
}

interface ProgressPayload {
  completed: number;
  total: number;
  found: number;
}

interface DonePayload {
  completed: number;
  total: number;
  found: number;
  aborted: boolean;
  endedAt: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-blood text-void",
  high: "bg-red-400 text-void",
  medium: "bg-yellow-400 text-void",
  info: "bg-ash text-void",
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: "border-l-blood",
  high: "border-l-red-400",
  medium: "border-l-yellow-400",
  info: "border-l-ash",
};

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

const fmtElapsed = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
  return `${pad2(m)}:${pad2(sec)}`;
};

/** Per-chunk SSE parser — same pattern as use-scan.ts */
function makeSseParser(): (chunk: string) => Array<{ event: string; data: string }> {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    const events: Array<{ event: string; data: string }> = [];
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) {
        events.push({ event, data: dataLines.join("\n") });
      }
    }
    return events;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Motion presets
// ──────────────────────────────────────────────────────────────────────────────

const PANEL_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.2, 0.7, 0.2, 1] as const },
};

const STAGGER = {
  container: {
    animate: { transition: { staggerChildren: 0.03 } },
  },
  item: {
    initial: { opacity: 0, x: -4 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.18 },
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────

export function LeakScanner(): React.ReactElement {
  const t = useT();

  // --- Config state ----------------------------------------------------------
  const [targets, setTargets] = useState("");
  const [ports, setPorts] = useState("80,443");
  const [concurrency, setConcurrency] = useState(20);
  // Evasion
  const [proxy, setProxy] = useState("");
  const [delay, setDelay] = useState(0);
  const [randomAgent, setRandomAgent] = useState(true);
  const [randomize, setRandomize] = useState(true);
  const [protoHttp, setProtoHttp] = useState(true);
  const [protoHttps, setProtoHttps] = useState(true);

  // --- Wordlist state --------------------------------------------------------
  const [wordlist, setWordlist] = useState<WordlistResponse | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedSeverities, setSelectedSeverities] = useState<string[]>([
    "critical",
    "high",
    "medium",
    "info",
  ]);

  // --- Scan state ------------------------------------------------------------
  const [scanning, setScanning] = useState(false);
  const [totalScans, setTotalScans] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [found, setFound] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // --- Refs ------------------------------------------------------------------
  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Fetch wordlist on mount -----------------------------------------------
  useEffect(() => {
    let cancelled = false;
    fetch("/api/leak/wordlist")
      .then((res) => res.json())
      .then((data: WordlistResponse) => {
        if (!cancelled) {
          setWordlist(data);
          setSelectedCategories(data.categories);
        }
      })
      .catch(() => {
        // silently ignore — wordlist fetch is optional for UI display
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Elapsed timer while scanning ------------------------------------------
  useEffect(() => {
    if (scanning && startedAt) {
      if (tickRef.current === null) {
        tickRef.current = setInterval(() => {
          setElapsed(Date.now() - (startedAt ?? Date.now()));
        }, 200);
      }
    } else if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [scanning, startedAt]);

  // --- Derived ---------------------------------------------------------------
  const protocols = useMemo(() => {
    const p: string[] = [];
    if (protoHttp) p.push("http");
    if (protoHttps) p.push("https");
    return p;
  }, [protoHttp, protoHttps]);

  const progressPercent = useMemo(() => {
    if (totalScans === 0) return 0;
    return Math.round((completed / totalScans) * 100);
  }, [completed, totalScans]);

  const canScan = useMemo(() => {
    return targets.trim().length > 0 && protocols.length > 0 && !scanning;
  }, [targets, protocols, scanning]);

  // --- Scan ------------------------------------------------------------------
  const startScan = useCallback(async () => {
    if (!canScan) return;

    // Reset
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
    }
    const ac = new AbortController();
    abortRef.current = ac;

    setScanning(true);
    setTotalScans(0);
    setCompleted(0);
    setFound(0);
    setResults([]);
    setExpandedRows(new Set());
    setElapsed(0);

    let res: Response;
    try {
      const body = {
        targets: targets.trim(),
        ports,
        concurrency,
        protocols,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
        severities:
          selectedSeverities.length === 4 ? undefined : selectedSeverities,
        proxy: proxy.trim() || undefined,
        delay: delay > 0 ? delay : undefined,
        randomAgent,
        randomize,
      };

      const now = Date.now();
      setStartedAt(now);

      res = await fetch("/api/leak/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
      setScanning(false);
      setStartedAt(null);
      return;
    }

    if (!res.ok || !res.body) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        detail = j.error ?? detail;
      } catch { /* not JSON */ }
      toast.error(detail);
      setScanning(false);
      setStartedAt(null);
      return;
    }

    toast.success("Scan engaged");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = makeSseParser();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const events = parse(text);
        for (const ev of events) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(ev.data);
          } catch {
            continue;
          }

          if (ev.event === "meta") {
            const m = parsed as MetaPayload;
            setTotalScans(m.totalScans);
            setStartedAt((prev) => prev ?? m.startedAt);
          } else if (ev.event === "found") {
            const r = parsed as ScanResult;
            setResults((prev) => [...prev, r]);
            setFound((prev) => prev + 1);
          } else if (ev.event === "progress") {
            const p = parsed as ProgressPayload;
            setCompleted(p.completed);
            setTotalScans(p.total);
            setFound(p.found);
          } else if (ev.event === "done") {
            const d = parsed as DonePayload;
            setCompleted(d.completed);
            setTotalScans(d.total);
            setFound(d.found);
            setElapsed(d.endedAt - (startedAt ?? d.endedAt));
            if (d.aborted) {
              toast("Scan aborted");
            } else {
              toast.success(`Scan complete — ${d.found} findings`);
            }
          }
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
      }
    } finally {
      setScanning(false);
    }
  }, [
    canScan,
    targets,
    ports,
    concurrency,
    protocols,
    selectedCategories,
    selectedSeverities,
    startedAt,
  ]);

  // --- Abort -----------------------------------------------------------------
  const abortScan = useCallback(() => {
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
    }
  }, []);

  // --- Toggle severity filter ------------------------------------------------
  const toggleSeverity = useCallback((s: string) => {
    setSelectedSeverities((prev) => {
      if (prev.includes(s)) {
        if (prev.length <= 1) return prev; // keep at least one
        return prev.filter((x) => x !== s);
      }
      return [...prev, s];
    });
  }, []);

  // --- Toggle category filter ------------------------------------------------
  const toggleCategory = useCallback((cat: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        if (prev.length <= 1) return prev; // keep at least one
        return prev.filter((x) => x !== cat);
      }
      return [...prev, cat];
    });
  }, []);

  // --- Toggle row expansion --------------------------------------------------
  const toggleExpand = useCallback((idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  // --- Concurrency controls --------------------------------------------------
  const incConcurrency = useCallback(() => {
    setConcurrency((prev) => Math.min(prev + 5, 100));
  }, []);
  const decConcurrency = useCallback(() => {
    setConcurrency((prev) => Math.max(prev - 5, 1));
  }, []);

  // --- Cleanup on unmount ----------------------------------------------------
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        try { abortRef.current.abort(); } catch { /* ignore */ }
      }
    };
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────────────

  const isEmpty = results.length === 0 && !scanning;

  return (
    <motion.div {...PANEL_MOTION} className="flex flex-col gap-4">
      {/* ── Config Panel ──────────────────────────────────────────────── */}
      <div className="border border-blood-deep/60 bg-ink/70 p-4 bracket-corners">
        {/* Targets */}
        <div className="flex flex-col gap-1 mb-4">
          <label className="font-mono text-[10px] text-ash tracking-wider uppercase">
            Targets
          </label>
          <textarea
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            placeholder={"192.168.1.0/24\nexample.com\n10.0.0.1"}
            rows={3}
            className="w-full bg-void border border-blood-deep/30 p-2 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood/50 focus:outline-none resize-y"
          />
          <span className="font-mono text-[9px] text-ash-dim">
            IPs, CIDRs, or hostnames — one per line
          </span>
        </div>

        {/* Row: ports + concurrency + protocols */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          {/* Ports */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-ash tracking-wider uppercase">
              Ports
            </label>
            <input
              type="text"
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              className="w-28 bg-void border border-blood-deep/30 p-1.5 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood/50 focus:outline-none"
              placeholder="80,443"
            />
          </div>

          {/* Concurrency */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-ash tracking-wider uppercase">
              Concurrency
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={decConcurrency}
                disabled={scanning}
                className="w-7 h-7 flex items-center justify-center border border-blood-deep/40 bg-void text-bone font-mono text-xs hover:border-blood/60 disabled:opacity-30 transition-colors"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={100}
                value={concurrency}
                onChange={(e) =>
                  setConcurrency(
                    Math.max(1, Math.min(100, parseInt(e.target.value) || 1)),
                  )
                }
                disabled={scanning}
                className="w-14 text-center bg-void border border-blood-deep/30 p-1.5 font-mono text-xs text-blood-neon focus:border-blood/50 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                onClick={incConcurrency}
                disabled={scanning}
                className="w-7 h-7 flex items-center justify-center border border-blood-deep/40 bg-void text-bone font-mono text-xs hover:border-blood/60 disabled:opacity-30 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {/* Protocols */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-ash tracking-wider uppercase">
              Protocols
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 font-mono text-xs text-bone cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={protoHttp}
                  onChange={(e) => setProtoHttp(e.target.checked)}
                  disabled={scanning}
                  className="accent-blood w-3.5 h-3.5"
                />
                HTTP
              </label>
              <label className="flex items-center gap-1.5 font-mono text-xs text-bone cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={protoHttps}
                  onChange={(e) => setProtoHttps(e.target.checked)}
                  disabled={scanning}
                  className="accent-blood w-3.5 h-3.5"
                />
                HTTPS
              </label>
            </div>
          </div>
        </div>

        {/* Evasion row: proxy, delay, random agent, randomize */}
        <div className="flex flex-wrap items-end gap-4 mb-4">
          {/* Proxy */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-ash tracking-wider uppercase">
              Proxy
            </label>
            <input
              type="text"
              value={proxy}
              onChange={(e) => setProxy(e.target.value)}
              disabled={scanning}
              className="w-44 bg-void border border-blood-deep/30 p-1.5 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood/50 focus:outline-none disabled:opacity-30"
              placeholder="http://127.0.0.1:8080"
            />
          </div>

          {/* Delay (ms) */}
          <div className="flex flex-col gap-1">
            <label className="font-mono text-[10px] text-ash tracking-wider uppercase">
              Delay (ms)
            </label>
            <input
              type="number"
              min={0}
              max={5000}
              step={100}
              value={delay}
              onChange={(e) => setDelay(Math.max(0, Math.min(5000, parseInt(e.target.value) || 0)))}
              disabled={scanning}
              className="w-20 text-center bg-void border border-blood-deep/30 p-1.5 font-mono text-xs text-bone focus:border-blood/50 focus:outline-none disabled:opacity-30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>

          {/* Random Agent toggle */}
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-ash tracking-wider uppercase cursor-pointer select-none pb-1">
            <input
              type="checkbox"
              checked={randomAgent}
              onChange={(e) => setRandomAgent(e.target.checked)}
              disabled={scanning}
              className="accent-blood w-3 h-3"
            />
            Rotate UA
          </label>

          {/* Randomize paths toggle */}
          <label className="flex items-center gap-1.5 font-mono text-[10px] text-ash tracking-wider uppercase cursor-pointer select-none pb-1">
            <input
              type="checkbox"
              checked={randomize}
              onChange={(e) => setRandomize(e.target.checked)}
              disabled={scanning}
              className="accent-blood w-3 h-3"
            />
            Random paths
          </label>
        </div>

        {/* Category filter */}
        {wordlist && wordlist.categories.length > 0 && (
          <div className="mb-4">
            <label className="font-mono text-[10px] text-ash tracking-wider uppercase block mb-1.5">
              Categories
            </label>
            <div className="flex flex-wrap gap-1.5">
              {wordlist.categories.map((cat) => {
                const active = selectedCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    disabled={scanning}
                    className={cn(
                      "font-mono text-[10px] px-2 py-0.5 border transition-colors",
                      active
                        ? "border-blood bg-blood/15 text-blood-neon"
                        : "border-ash-dim/30 bg-void text-ash-dim hover:border-ash-dim/60",
                      scanning && "opacity-50",
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Severity filter */}
        <div className="mb-3">
          <label className="font-mono text-[10px] text-ash tracking-wider uppercase block mb-1.5">
            Severity
          </label>
          <div className="flex flex-wrap gap-1.5">
            {(["critical", "high", "medium", "info"] as const).map((sev) => {
              const active = selectedSeverities.includes(sev);
              return (
                <button
                  key={sev}
                  type="button"
                  onClick={() => toggleSeverity(sev)}
                  disabled={scanning}
                  className={cn(
                    "font-mono text-[10px] px-2 py-0.5 border transition-colors uppercase",
                    active
                      ? [
                          sev === "critical" && "border-blood bg-blood/15 text-blood-neon",
                          sev === "high" && "border-red-400/60 bg-red-400/10 text-red-400",
                          sev === "medium" && "border-yellow-400/60 bg-yellow-400/10 text-yellow-400",
                          sev === "info" && "border-ash/60 bg-ash/10 text-ash",
                        ]
                      : "border-ash-dim/30 bg-void text-ash-dim hover:border-ash-dim/60",
                    scanning && "opacity-50",
                  )}
                >
                  {sev}
                </button>
              );
            })}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startScan}
            disabled={!canScan}
            className={cn(
              "relative font-mono text-xs font-bold tracking-widest uppercase px-6 py-2 border transition-all",
              canScan
                ? "border-blood bg-blood text-void shadow-[0_0_18px_rgba(255,0,51,0.35)] hover:shadow-[0_0_28px_rgba(255,0,51,0.55)] active:scale-[0.97]"
                : "border-ash-dim/30 bg-void text-ash-dim cursor-not-allowed",
            )}
          >
            SCAN
          </button>

          {scanning && (
            <button
              type="button"
              onClick={abortScan}
              className="font-mono text-xs font-bold tracking-widest uppercase px-6 py-2 border border-yellow-400/60 bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 transition-colors"
            >
              ABORT
            </button>
          )}
        </div>
      </div>

      {/* ── Progress Bar ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {(scanning || completed > 0) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="border border-blood-deep/60 bg-ink/70 p-3">
              <div className="flex items-center justify-between font-mono text-[10px] text-ash-dim mb-2">
                <span>
                  {completed}/{totalScans} scans
                </span>
                <span className="text-blood-neon">
                  {found} found
                </span>
                <span>{fmtElapsed(elapsed)}</span>
              </div>

              {/* Progress track */}
              <div className="relative w-full h-2 bg-void border border-blood-deep/30">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-blood shadow-[0_0_8px_rgba(255,0,51,0.6)]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results Table ─────────────────────────────────────────────── */}
      {isEmpty && !scanning && (
        <div className="flex items-center justify-center p-12 border border-blood-deep/30 bg-ink/50 bracket-corners">
          <span className="font-mono text-sm text-ash-dim tracking-wider">
            Configure targets and press SCAN
          </span>
        </div>
      )}

      <AnimatePresence>
        {results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="border border-blood-deep/60 bg-ink/70 overflow-hidden"
          >
            {/* Table header */}
            <div className="grid grid-cols-[80px_1fr_60px_1fr_60px_70px_1fr] gap-0">
              {["Severity", "Target", "Port", "Path", "Status", "Size", "Snippet"].map(
                (hdr) => (
                  <div
                    key={hdr}
                    className="font-mono text-[10px] text-ash tracking-wider uppercase px-3 py-2 border-b border-blood-deep/30 bg-ink"
                  >
                    {hdr}
                  </div>
                ),
              )}
            </div>

            {/* Scrollable body */}
            <div className="max-h-[60vh] overflow-y-auto">
              <motion.div
                variants={STAGGER.container}
                initial="initial"
                animate="animate"
              >
                {results.map((r, idx) => {
                  const expanded = expandedRows.has(idx);
                  const sevBorder = SEVERITY_BORDER[r.entry.severity] ?? "border-l-ash";

                  return (
                    <motion.div key={idx} variants={STAGGER.item}>
                      <div
                        onClick={() => toggleExpand(idx)}
                        className={cn(
                          "grid grid-cols-[80px_1fr_60px_1fr_60px_70px_1fr] gap-0 cursor-pointer border-l-2 transition-colors hover:bg-blood/5",
                          sevBorder,
                          idx % 2 === 0 ? "bg-ink/40" : "bg-transparent",
                          expanded && "bg-blood/5",
                        )}
                      >
                        {/* Severity */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span
                            className={cn(
                              "font-mono text-[9px] font-bold uppercase px-1.5 py-0.5",
                              SEVERITY_COLORS[r.entry.severity] ?? "bg-ash text-void",
                            )}
                          >
                            {r.entry.severity}
                          </span>
                        </div>

                        {/* Target */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span className="font-mono text-[10px] text-bone-dim truncate">
                            {r.target}
                          </span>
                        </div>

                        {/* Port */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span className="font-mono text-[10px] text-ash">
                            {r.port}
                          </span>
                        </div>

                        {/* Path */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span className="font-mono text-[10px] text-blood-neon truncate">
                            {r.path}
                          </span>
                        </div>

                        {/* Status */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span
                            className={cn(
                              "font-mono text-[10px]",
                              r.status >= 200 && r.status < 300
                                ? "text-green-400"
                                : r.status >= 400
                                  ? "text-yellow-400"
                                  : "text-ash",
                            )}
                          >
                            {r.status}
                          </span>
                        </div>

                        {/* Size */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span className="font-mono text-[10px] text-ash-dim">
                            {r.contentLength != null
                              ? r.contentLength > 1024
                                ? `${(r.contentLength / 1024).toFixed(1)}k`
                                : r.contentLength
                              : "—"}
                          </span>
                        </div>

                        {/* Snippet (truncated) */}
                        <div className="px-3 py-1.5 flex items-center">
                          <span className="font-mono text-[9px] text-ash-dim truncate max-w-[200px]">
                            {r.snippet
                              ? r.snippet.replace(/\n/g, " ").slice(0, 80)
                              : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Expanded snippet */}
                      <AnimatePresence>
                        {expanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t border-blood-deep/20 bg-void/60 px-8 py-3">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-ash uppercase tracking-wider">
                                    Description
                                  </span>
                                  <span className="font-mono text-[11px] text-bone-dim">
                                    {r.entry.description}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 text-[9px] text-ash-dim">
                                  <span>
                                    {r.protocol}://{r.target}:{r.port}{r.path}
                                  </span>
                                  <span>·</span>
                                  <span>{r.durationMs}ms</span>
                                </div>
                                {r.snippet && (
                                  <div className="mt-1">
                                    <span className="font-mono text-[10px] text-ash uppercase tracking-wider block mb-1">
                                      Body preview
                                    </span>
                                    <pre className="font-mono text-[10px] text-bone-dim bg-void border border-blood-deep/20 p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                                      {r.snippet.slice(0, 600)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>

            {/* Footer summary */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-blood-deep/30 bg-ink font-mono text-[10px] text-ash-dim">
              <span>
                {results.length} finding{results.length !== 1 ? "s" : ""}
              </span>
              <span>
                {completed}/{totalScans} targets · {fmtElapsed(elapsed)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
