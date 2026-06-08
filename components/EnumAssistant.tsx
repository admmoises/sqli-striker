"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "dbs" | "tables" | "columns" | "dump" | "count";

interface EnumState {
  target: string;
  targetOk: boolean;
  method: "GET" | "POST";
  data: string;
  cookie: string;
  threads: number;

  /** DB currently targeted by step operations. Also controls schema-tree expansion. */
  selectedDb: string | null;
  /** Table currently targeted by step operations. Also controls column expansion. */
  selectedTable: string | null;

  /** All databases discovered via --dbs (persisted). */
  databases: string[];
  /** db name → table names (persisted per DB — survives collapse/expand). */
  tablesByDb: Record<string, string[]>;
  /** "db.table" → column names (persisted per table — survives collapse/expand). */
  columnsByTable: Record<string, string[]>;
  /** "db.table" → Set of checked column names for selective dump. */
  checkedColumns: Record<string, Set<string>>;

  /** Step currently in flight (null = idle). */
  activeStep: Step | null;
  running: boolean;
  exitCode: number | null;

  /** Raw output preserved per step key. Accumulated across executions of same step. */
  outputByStep: Partial<Record<Step, string[]>>;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;
const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g;

const PANEL_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.2, 0.7, 0.2, 1] as const },
};

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface StepDef {
  id: Step;
  labelKey: string;
  needsDb: boolean;
  needsTable: boolean;
}

const STEPS: StepDef[] = [
  { id: "dbs", labelKey: "enum.step.dbs", needsDb: false, needsTable: false },
  { id: "tables", labelKey: "enum.step.tables", needsDb: true, needsTable: false },
  { id: "columns", labelKey: "enum.step.columns", needsDb: true, needsTable: true },
  { id: "count", labelKey: "enum.step.count", needsDb: true, needsTable: true },
  { id: "dump", labelKey: "enum.step.dump", needsDb: true, needsTable: true },
];

// ---------------------------------------------------------------------------
// Arg builder — pure, reads from a snapshot
// ---------------------------------------------------------------------------

function buildEnumArgs(s: EnumState, step: Step): string[] {
  const args: string[] = [];
  args.push("-u", s.target);
  if (s.method === "POST") args.push("--method=POST");
  if (s.data.trim()) args.push(`--data=${s.data.trim()}`);
  if (s.cookie.trim()) args.push(`--cookie=${s.cookie.trim()}`);
  if (s.threads > 1) args.push(`--threads=${s.threads}`);
  args.push("--batch", "--disable-coloring");

  switch (step) {
    case "dbs":
      args.push("--dbs");
      break;
    case "tables":
      if (s.selectedDb) args.push("-D", s.selectedDb, "--tables");
      break;
    case "columns":
      if (s.selectedDb && s.selectedTable) args.push("-D", s.selectedDb, "-T", s.selectedTable, "--columns");
      break;
    case "count":
      if (s.selectedDb && s.selectedTable) args.push("-D", s.selectedDb, "-T", s.selectedTable, "--count");
      break;
    case "dump": {
      if (s.selectedDb && s.selectedTable) {
        args.push("-D", s.selectedDb, "-T", s.selectedTable, "--dump");
        const key = `${s.selectedDb}.${s.selectedTable}`;
        const cols = s.columnsByTable[key] ?? [];
        const checked = s.checkedColumns[key];
        if (cols.length > 0 && checked && checked.size > 0 && checked.size < cols.length) {
          args.push("-C", Array.from(checked).join(","));
        }
      }
      break;
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Output parser — extracts DBs, tables, columns from sqlmap stdout lines
// ---------------------------------------------------------------------------

function parseEnumOutput(
  state: EnumState,
  step: Step,
  lines: string[],
): Partial<EnumState> {
  switch (step) {
    case "dbs": {
      const found: string[] = [];
      for (const line of lines) {
        const m = line.match(/^\[\*\]\s+(\S+)\s*$/);
        if (m && !found.includes(m[1])) found.push(m[1]);
      }
      if (found.length === 0) return {};
      // Merge with existing: keep old DBs, add new ones
      const merged = [...state.databases];
      for (const db of found) {
        if (!merged.includes(db)) merged.push(db);
      }
      return { databases: merged };
    }
    case "tables": {
      if (!state.selectedDb) return {};
      const found: string[] = [];
      for (const line of lines) {
        const m1 = line.match(/^\|\s*(\S+)\s*\|/);
        if (m1 && m1[1] !== "Table" && m1[1] !== "+" && !found.includes(m1[1])) {
          found.push(m1[1]);
        }
        const m2 = line.match(/^Table:\s+(.+?)$/i);
        if (m2) {
          const name = m2[1].trim();
          if (!found.includes(name)) found.push(name);
        }
      }
      if (found.length === 0) return {};
      return {
        tablesByDb: { ...state.tablesByDb, [state.selectedDb]: found },
      };
    }
    case "columns": {
      if (!state.selectedDb || !state.selectedTable) return {};
      const key = `${state.selectedDb}.${state.selectedTable}`;
      const cols: string[] = [];
      let inTable = false;
      for (const line of lines) {
        if (/^\|\s*Column\s*\|\s*Type\s*\|/i.test(line)) {
          inTable = true;
          continue;
        }
        if (inTable) {
          const m = line.match(/^\|\s*([A-Za-z0-9_]+)\s*\|/);
          if (m) {
            if (!cols.includes(m[1])) cols.push(m[1]);
          } else if (line.startsWith("+") || line.trim() === "") {
            inTable = false;
          }
        }
      }
      if (cols.length === 0) return {};
      return { columnsByTable: { ...state.columnsByTable, [key]: cols } };
    }
    default:
      return {};
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EnumAssistant(): React.ReactElement {
  const t = useT();

  const [state, setState] = useState<EnumState>({
    target: "",
    targetOk: false,
    method: "GET",
    data: "",
    cookie: "",
    threads: 1,
    selectedDb: null,
    selectedTable: null,
    databases: [],
    tablesByDb: {},
    columnsByTable: {},
    checkedColumns: {},
    activeStep: null,
    running: false,
    exitCode: null,
    outputByStep: {},
  });

  // Keep a ref so async callbacks always read the latest state without
  // needing [state] in the dependency array (which recreates run() on every
  // keystroke and breaks AbortController chaining).
  const stateRef = useRef(state);
  stateRef.current = state;

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll raw output
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  // Patch helper
  const patch = useCallback(
    <K extends keyof EnumState>(k: K, v: EnumState[K]) =>
      setState((s) => {
        const next = { ...s, [k]: v };
        if (k === "target") next.targetOk = URL_RE.test(v as string);
        return next;
      }),
    [],
  );

  // -------------------------------------------------------------------
  // Core enumeration executor (uses ref to avoid stale closure)
  // -------------------------------------------------------------------
  const run = useCallback(async (step: Step) => {
    const snap = stateRef.current;
    const args = buildEnumArgs(snap, step);

    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* noop */ }
    }
    const ac = new AbortController();
    abortRef.current = ac;

    setState((s) => ({ ...s, running: true, activeStep: step, exitCode: null }));

    let res: Response;
    try {
      res = await fetch("/api/sqlmap/enum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
        signal: ac.signal,
      });
    } catch (e) {
      const msg =
        e instanceof DOMException && e.name === "AbortError"
          ? "aborted"
          : e instanceof Error
            ? e.message
            : String(e);
      setState((s) => ({ ...s, running: false, activeStep: null }));
      if (msg !== "aborted") toast.error(msg);
      return;
    }

    if (!res.ok || !res.body) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) detail = j.error;
      } catch { /* ignore */ }
      setState((s) => ({ ...s, running: false, activeStep: null, exitCode: -1 }));
      toast.error(detail);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const accumulated: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const rawLines = buf.split(/\r\n|\n|\r/);
        buf = rawLines.pop() ?? "";
        const clean = rawLines.map((l) => l.replace(ANSI_RE, ""));
        if (clean.length > 0) {
          accumulated.push(...clean);
          // Stream in-place so terminal updates in real-time
          setState((s) => ({
            ...s,
            outputByStep: { ...s.outputByStep, [step]: [...accumulated] },
          }));
        }
      }
    } catch (e) {
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, running: false, activeStep: null }));
        toast.error(msg);
        return;
      }
    } finally {
      // Flush residual
      if (buf.trim().length > 0) {
        const clean = buf.replace(ANSI_RE, "");
        if (clean.trim().length > 0) accumulated.push(clean);
      }
      // Final update: persist output + parse results
      setState((s) => {
        const parsed = parseEnumOutput(s, step, accumulated);
        return {
          ...s,
          ...parsed,
          running: false,
          activeStep: null,
          exitCode: ac.signal.aborted ? s.exitCode : 0,
          outputByStep: { ...s.outputByStep, [step]: accumulated },
        };
      });
    }
  }, []);

  // -------------------------------------------------------------------
  // Selection helpers — set active DB/table, preserve enumerated data
  // -------------------------------------------------------------------

  const selectDb = useCallback((db: string) => {
    setState((s) => {
      // Toggle: clicking the same DB deselects it (collapses)
      if (s.selectedDb === db) {
        return { ...s, selectedDb: null, selectedTable: null };
      }
      return { ...s, selectedDb: db, selectedTable: null };
    });
  }, []);

  const selectTable = useCallback((tbl: string) => {
    setState((s) => {
      if (s.selectedTable === tbl) {
        return { ...s, selectedTable: null };
      }
      return { ...s, selectedTable: tbl };
    });
  }, []);

  const toggleColumn = useCallback((tableKey: string, col: string) => {
    setState((s) => {
      const existing = s.checkedColumns[tableKey] ?? new Set<string>();
      const next = new Set(existing);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return { ...s, checkedColumns: { ...s.checkedColumns, [tableKey]: next } };
    });
  }, []);

  const toggleAllColumns = useCallback((tableKey: string) => {
    setState((s) => {
      const cols = s.columnsByTable[tableKey] ?? [];
      const existing = s.checkedColumns[tableKey] ?? new Set<string>();
      if (existing.size === cols.length && cols.length > 0) {
        // All checked → uncheck all
        return { ...s, checkedColumns: { ...s.checkedColumns, [tableKey]: new Set<string>() } };
      }
      return { ...s, checkedColumns: { ...s.checkedColumns, [tableKey]: new Set(cols) } };
    });
  }, []);

  // -------------------------------------------------------------------
  // Derived: which step's output to show in the raw panel
  // -------------------------------------------------------------------
  const activeOutputLines: string[] = (() => {
    if (state.activeStep) return state.outputByStep[state.activeStep] ?? [];
    const last = (Object.keys(state.outputByStep) as Step[]).pop();
    return last ? (state.outputByStep[last] ?? []) : [];
  })();

  const currentTableKey =
    state.selectedDb && state.selectedTable
      ? `${state.selectedDb}.${state.selectedTable}`
      : null;

  return (
    <main className="min-h-screen flex flex-col text-bone bg-ink">
      {/* TOP BAR */}
      <header className="border-b border-blood-deep/60 bg-void/70 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="min-w-0">
            <div className="text-blood glow-red font-display text-xl sm:text-2xl tracking-[0.18em] leading-none chromatic">
              SQLMAP <span className="text-blood-neon">⟁</span> ENUMERATION
            </div>
            <div className="text-[11px] tracking-wider text-bone-dim mt-1">
              Database · Table · Column · Dump
            </div>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-1.5 border border-blood-deep/70 px-3 py-1.5 text-xs font-mono tracking-wider text-ash hover:text-blood-neon hover:border-blood transition-colors"
          >
            <span className="text-blood">⟵</span> {t("enum.backToConsole")}
          </a>
        </div>
        <div className="divider-x" />
      </header>

      {/* MAIN GRID */}
      <section className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 p-3 sm:p-4 lg:p-6">
        {/* LEFT — Target config + step palette */}
        <motion.aside
          {...PANEL_MOTION}
          className="lg:col-span-4 xl:col-span-3 bracket-corners bg-void/40 p-3 sm:p-4 space-y-4 lg:max-h-[calc(100vh-120px)] overflow-y-auto"
        >
          <div className="text-sm font-display tracking-wider text-bone pb-1 uppercase">
            <span className="text-blood">▍</span> {t("enum.targetConfig")}
          </div>

          {/* Target URL */}
          <div className="space-y-1">
            <label className="text-xs tracking-wider text-ash font-mono">{t("target.label")}</label>
            <input
              type="text"
              value={state.target}
              onChange={(e) => patch("target", e.target.value as EnumState["target"])}
              placeholder={t("target.placeholder")}
              className={cn(
                "w-full bg-void border px-2.5 py-2 text-sm font-mono placeholder:text-ash-dim/50",
                state.targetOk ? "border-blood-deep" : "border-ash-dim",
                "focus:border-blood focus:shadow-[0_0_8px_rgba(255,0,51,0.25)] transition-colors",
              )}
            />
          </div>

          {/* Method toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs tracking-wider text-ash font-mono">{t("method.label")}</span>
            {(["GET", "POST"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patch("method", m)}
                className={cn(
                  "px-2.5 py-1 text-xs font-mono border transition-colors",
                  state.method === m
                    ? "border-blood bg-blood/20 text-blood-neon"
                    : "border-ash-dim text-ash hover:border-ash",
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {/* POST body */}
          {state.method === "POST" && (
            <div className="space-y-1">
              <label className="text-xs tracking-wider text-ash font-mono">{t("method.body")}</label>
              <input
                type="text"
                value={state.data}
                onChange={(e) => patch("data", e.target.value)}
                placeholder={t("method.body.placeholder")}
                className="w-full bg-void border border-ash-dim px-2.5 py-2 text-sm font-mono placeholder:text-ash-dim/50 focus:border-blood transition-colors"
              />
            </div>
          )}

          {/* Cookie */}
          <div className="space-y-1">
            <label className="text-xs tracking-wider text-ash font-mono">{t("method.cookie")}</label>
            <input
              type="text"
              value={state.cookie}
              onChange={(e) => patch("cookie", e.target.value)}
              placeholder={t("method.cookie.placeholder")}
              className="w-full bg-void border border-ash-dim px-2.5 py-2 text-sm font-mono placeholder:text-ash-dim/50 focus:border-blood transition-colors"
            />
          </div>

          {/* Threads */}
          <div className="space-y-1">
            <label className="text-xs tracking-wider text-ash font-mono">{t("enum.threads")}</label>
            <input
              type="range"
              min={1}
              max={10}
              value={state.threads}
              onChange={(e) => patch("threads", Number(e.target.value) as EnumState["threads"])}
              className="w-full accent-blood"
            />
            <div className="text-xs text-blood-neon font-mono text-right">{state.threads}</div>
          </div>

          {/* --- STEP BUTTONS --- */}
          <div className="space-y-1.5 pt-3 border-t border-blood-deep/40">
            <div className="text-xs tracking-wider text-ash font-mono pb-1">
              <span className="text-blood">▍</span> {t("enum.phase")}
            </div>

            {STEPS.map((step) => {
              const disabled =
                !state.targetOk ||
                (step.needsDb && !state.selectedDb) ||
                (step.needsTable && !state.selectedTable);
              const isActive = state.activeStep === step.id;
              // Show badge if we have persisted output for this step
              const hasOutput = (state.outputByStep[step.id]?.length ?? 0) > 0;

              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={disabled || state.running}
                  onClick={() => run(step.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 font-mono text-sm tracking-wider border transition-all flex items-center justify-between",
                    isActive
                      ? "border-blood-neon bg-blood/15 text-blood-neon animate-pulse-red"
                      : disabled
                        ? "border-ash-dim/30 text-ash-dim/50 cursor-not-allowed"
                        : "border-ash-dim/60 text-bone hover:border-blood hover:text-blood-neon hover:bg-void/80",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {t(step.labelKey as Parameters<typeof t>[0])}
                    {hasOutput && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blood-neon" />
                    )}
                  </span>
                  <span className="text-xs text-ash font-mono">
                    {isActive ? "···" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Breadcrumb */}
          <div className="text-[10px] text-ash-dim font-mono pt-1 space-y-0.5">
            <div>
              TARGET: {state.targetOk ? <span className="text-blood-neon">{t("target.locked")}</span> : <span className="text-ash">{t("target.standby")}</span>}
            </div>
            <div>
              DB: {state.selectedDb ? <span className="text-blood-neon">{state.selectedDb}</span> : <span className="text-ash">--</span>}
            </div>
            <div>
              TABLE: {state.selectedTable ? <span className="text-blood-neon">{state.selectedTable}</span> : <span className="text-ash">--</span>}
            </div>
          </div>
        </motion.aside>

        {/* CENTER — Schema tree */}
        <motion.section
          {...PANEL_MOTION}
          className="lg:col-span-4 xl:col-span-4 bracket-corners bg-void/60 p-3 sm:p-4 flex flex-col min-h-[420px] lg:max-h-[calc(100vh-120px)] overflow-hidden"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-display tracking-wider text-bone uppercase">
              <span className="text-blood">▍</span> Schema
            </div>
            {currentTableKey &&
              (state.columnsByTable[currentTableKey]?.length ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={() => toggleAllColumns(currentTableKey)}
                  className="text-xs font-mono tracking-wider text-ash hover:text-blood-neon border border-ash-dim/60 px-2 py-0.5 transition-colors"
                >
                  {t("enum.selectAll")}
                </button>
              )}
          </div>
          <div className="divider-x mb-2" />

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {state.databases.length === 0 && (
              <div className="text-xs text-ash-dim font-mono text-center py-8">
                {t("enum.noDatabases")}
              </div>
            )}
            {state.databases.map((db) => {
              const isExpanded = state.selectedDb === db;
              const tables = state.tablesByDb[db] ?? [];
              const dbHasData = tables.length > 0;

              return (
                <div key={db}>
                  {/* DB row */}
                  <button
                    type="button"
                    onClick={() => selectDb(db)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 font-mono text-sm flex items-center gap-1.5 transition-colors group",
                      isExpanded
                        ? "text-blood-neon bg-blood/10 border-l-2 border-blood"
                        : "text-bone hover:text-blood-neon hover:bg-void/80 border-l-2 border-transparent",
                    )}
                  >
                    <span className="text-blood-deep shrink-0 w-3 text-center">
                      {isExpanded ? "▾" : "▸"}
                    </span>
                    <span className="truncate">{db}</span>
                    {dbHasData && (
                      <span className="text-ash text-xs ml-auto">[{tables.length}]</span>
                    )}
                    {!dbHasData && isExpanded && (
                      <span className="text-ash-dim text-[10px] ml-auto">empty</span>
                    )}
                  </button>

                  {/* Tables subtree — rendered if this DB is selected (expanded) */}
                  {isExpanded && (
                    <div className="ml-3 mt-0.5 border-l border-blood-deep/30 pl-2">
                      {!dbHasData && (
                        <div className="text-xs text-ash-dim font-mono py-1 pl-2">
                          {t("enum.selectTable")}
                        </div>
                      )}
                      {tables.map((tbl) => {
                        const tblKey = `${db}.${tbl}`;
                        const isTableExpanded = state.selectedTable === tbl;
                        const cols = state.columnsByTable[tblKey] ?? [];
                        const tblHasColumns = cols.length > 0;

                        return (
                          <div key={tbl}>
                            {/* Table row */}
                            <button
                              type="button"
                              onClick={() => selectTable(tbl)}
                              className={cn(
                                "w-full text-left px-2 py-1 font-mono text-xs flex items-center gap-1 transition-colors",
                                isTableExpanded
                                  ? "text-blood-neon bg-blood/10 border-l-2 border-blood-neon"
                                  : "text-bone-dim hover:text-blood-neon hover:bg-void/80 border-l-2 border-transparent",
                              )}
                            >
                              <span className="text-blood-deep/70 shrink-0 w-2.5 text-center">
                                {isTableExpanded ? "▾" : "▸"}
                              </span>
                              <span className="truncate">{tbl}</span>
                              {tblHasColumns && (
                                <span className="text-ash text-[10px] ml-auto">[{cols.length} {t("enum.cols")}]</span>
                              )}
                            </button>

                            {/* Columns subtree — rendered if table is expanded */}
                            {isTableExpanded && (
                              <div className="ml-3 mt-0.5 border-l border-blood-deep/20 pl-2">
                                {!tblHasColumns && (
                                  <div className="text-xs text-ash-dim font-mono py-1 pl-2">
                                    {t("enum.noColumns")}
                                  </div>
                                )}
                                {cols.map((col) => {
                                  const checked = state.checkedColumns[tblKey]?.has(col) ?? false;
                                  return (
                                    <button
                                      key={col}
                                      type="button"
                                      onClick={() => toggleColumn(tblKey, col)}
                                      className={cn(
                                        "w-full text-left px-2 py-0.5 font-mono text-xs flex items-center gap-1.5 transition-colors",
                                        checked
                                          ? "text-bone-bright"
                                          : "text-ash hover:text-bone",
                                      )}
                                    >
                                      <span
                                        className={cn(
                                          "shrink-0 w-3 h-3 border flex items-center justify-center text-[9px] leading-none",
                                          checked
                                            ? "border-blood bg-blood/30 text-blood-neon"
                                            : "border-ash-dim text-transparent",
                                        )}
                                      >
                                        {checked ? "✓" : " "}
                                      </span>
                                      <span className="truncate">{col}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* RIGHT — Raw output (preserved per step, switchable) */}
        <motion.aside
          {...PANEL_MOTION}
          className="lg:col-span-4 xl:col-span-5 bracket-corners bg-void/60 p-3 sm:p-4 flex flex-col min-h-[360px] lg:max-h-[calc(100vh-120px)] overflow-hidden"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-display tracking-wider text-bone uppercase">
              <span className="text-blood">▍</span> {t("enum.rawOutput")}
            </div>
            <div className="flex items-center gap-1.5">
              {/* Step tabs — quick-switch between output of different steps */}
              {STEPS.map((step) => {
                const lines = state.outputByStep[step.id];
                if (!lines || lines.length === 0) return null;
                const isCurrent =
                  state.activeStep === step.id ||
                  (state.activeStep === null &&
                    step.id === Object.keys(state.outputByStep).pop());
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() =>
                      setState((s) => ({ ...s, activeStep: null }))
                    }
                    className={cn(
                      "px-2 py-0.5 text-[10px] font-mono border transition-colors",
                      isCurrent
                        ? "border-blood-neon text-blood-neon bg-blood/10"
                        : "border-ash-dim/40 text-ash hover:border-ash",
                    )}
                  >
                    {step.id}
                  </button>
                );
              })}
              {state.running && (
                <span className="text-xs text-blood-neon font-mono tracking-wider animate-pulse ml-1">
                  {state.activeStep
                    ? t(
                        (STEPS.find((s) => s.id === state.activeStep)?.labelKey ??
                          "enum.phase") as Parameters<typeof t>[0],
                      )
                    : ""}
                </span>
              )}
            </div>
          </div>
          <div className="divider-x mb-2" />

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto bg-void/80 border border-blood-deep/30 p-3 font-mono text-xs leading-relaxed text-bone-dim"
          >
            {activeOutputLines.length === 0 ? (
              <span className="text-ash-dim">{t("enum.noOutput")}</span>
            ) : (
              activeOutputLines.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">
                  {line || " "}
                </div>
              ))
            )}
          </div>
        </motion.aside>
      </section>
    </main>
  );
}
