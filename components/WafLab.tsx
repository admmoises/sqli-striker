"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────────

type Tab = "fingerprint" | "tamper";

interface WafDetectionResult {
  detected: boolean;
  name: string | null;
  vendor: string | null;
  confidence: number;
  evidence: string[];
  allMatches: Array<{ name: string; confidence: number }>;
  target?: string;
  message?: string;
  blockedProbe?: number;
  blockStatus?: number;
}

interface TamperTestItem {
  name: string;
  passed: boolean;
  blocked: boolean;
  error: string | null;
  durationMs: number;
}

interface TamperTestResponse {
  target: string;
  results: TamperTestItem[];
  summary: {
    total: number;
    passed: number;
    blocked: number;
    inconclusive: number;
  };
}

interface Props {
  /** Current target URL to pre-fill. */
  target: string;
  /** Optionally pass tamper names selected in the parent TamperPicker. */
  tampers?: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared motion presets
// ──────────────────────────────────────────────────────────────────────────────

const PANEL_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.25, ease: [0.2, 0.7, 0.2, 1] as const },
};

const STAGGER = {
  container: {
    animate: { transition: { staggerChildren: 0.04 } },
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

export function WafLab({ target: initialTarget, tampers: preSelected = [] }: Props): React.ReactElement {
  const t = useT();

  // --- Tab state -----------------------------------------------------------
  const [tab, setTab] = useState<Tab>("fingerprint");

  // --- Fingerprint state ---------------------------------------------------
  const [fingerTarget, setFingerTarget] = useState(initialTarget);
  const [fingerLoading, setFingerLoading] = useState(false);
  const [fingerResult, setFingerResult] = useState<WafDetectionResult | null>(null);

  // --- Tamper test state ---------------------------------------------------
  const [testTarget, setTestTarget] = useState(initialTarget);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<TamperTestResponse | null>(null);
  const [selectedTampers, setSelectedTampers] = useState<string[]>(preSelected);

  // Sync external tampers prop into local selection when it changes
  // (but only if the user hasn't manually modified the list).
  const [tampersTouched, setTampersTouched] = useState(false);
  useEffect(() => {
    if (!tampersTouched && preSelected.length > 0) {
      setSelectedTampers(preSelected);
    }
  }, [preSelected, tampersTouched]);

  // Derive which tampers are selected for testing
  const testList = useMemo(
    () => (selectedTampers.length > 0 ? selectedTampers : preSelected),
    [selectedTampers, preSelected],
  );

  // ── Fingerprint: POST /api/waf/fingerprint ─────────────────────────────
  const runFingerprint = useCallback(async () => {
    const url = fingerTarget.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      toast.error(t("waf.invalidUrl"));
      return;
    }
    setFingerLoading(true);
    setFingerResult(null);
    try {
      const res = await fetch("/api/waf/fingerprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: url }),
      });
      const json = (await res.json()) as WafDetectionResult & { error?: string };
      if (!res.ok || json.error) {
        toast.error(json.error ?? `HTTP ${res.status}`);
        setFingerResult(null);
      } else {
        setFingerResult(json);
        if (json.detected) {
          toast.success(`${json.name} (${json.confidence}% confidence)`);
        } else {
          toast(json.message ?? t("waf.noDetection"));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setFingerLoading(false);
    }
  }, [fingerTarget, t]);

  // ── Tamper Test: POST /api/waf/tamper-test ────────────────────────────
  const runTamperTest = useCallback(async () => {
    const url = testTarget.trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      toast.error(t("waf.invalidUrl"));
      return;
    }
    if (testList.length === 0) {
      toast.error(t("waf.noTampers"));
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/waf/tamper-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: url, tampers: testList }),
      });
      const json = (await res.json()) as TamperTestResponse & { error?: string };
      if (!res.ok || json.error) {
        toast.error(json.error ?? `HTTP ${res.status}`);
      } else {
        setTestResult(json);
        const s = json.summary;
        toast.success(
          `${s.passed} passed · ${s.blocked} blocked · ${s.inconclusive} inconclusive`,
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTestLoading(false);
    }
  }, [testTarget, testList, t]);

  // ── Toggle individual tamper in test list ──────────────────────────────
  const toggleTamper = useCallback((name: string) => {
    setSelectedTampers((prev) => {
      setTampersTouched(true);
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      return [...prev, name];
    });
  }, []);

  // ── Result badge helpers ──────────────────────────────────────────────
  const statusBadge = (item: TamperTestItem) => {
    if (item.error) {
      return (
        <span className="text-[10px] font-mono text-ash bg-ash/10 border border-ash/30 px-1.5 py-0.5">
          ERR
        </span>
      );
    }
    if (item.passed) {
      return (
        <span className="text-[10px] font-mono text-green-400 bg-green-400/10 border border-green-400/30 px-1.5 py-0.5">
          PASS
        </span>
      );
    }
    if (item.blocked) {
      return (
        <span className="text-[10px] font-mono text-blood bg-blood/10 border border-blood/50 px-1.5 py-0.5">
          BLOCK
        </span>
      );
    }
    return (
      <span className="text-[10px] font-mono text-ash-dim bg-ash/5 border border-ash-dim/30 px-1.5 py-0.5">
        ?
      </span>
    );
  };

  // ── Confidence bar ────────────────────────────────────────────────────
  const confidenceBar = (pct: number) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-void border border-blood-deep/40 relative overflow-hidden">
        <motion.div
          className="h-full bg-blood-neon"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
        />
      </div>
      <span className="text-xs font-mono text-blood-neon w-10 text-right tabular-nums">
        {pct}%
      </span>
    </div>
  );

  // ── Tab definitions ───────────────────────────────────────────────────
  const TABS: { id: Tab; labelKey: string }[] = [
    { id: "fingerprint", labelKey: "waf.fingerprint" },
    { id: "tamper", labelKey: "waf.tamperTest" },
  ];

  return (
    <div className="space-y-3">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className="text-sm tracking-wider text-bone font-mono font-medium">
          <span className="text-blood-neon">▍</span> {t("waf.title")}
        </span>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="WAF laboratory sections"
        className="flex border-b border-blood-deep/60"
      >
        {TABS.map(({ id, labelKey }) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(id)}
              className={cn(
                "relative px-3 py-2 flex items-center gap-1.5 flex-1 min-w-[100px]",
                "transition-colors select-none focus:outline-none",
                "border-r border-blood-deep/40 last:border-r-0",
                isActive
                  ? "bg-[rgba(255,0,51,0.12)] text-bone-bright"
                  : "text-bone hover:text-blood-neon hover:bg-[rgba(255,0,51,0.05)]",
              )}
            >
              <span
                className={cn(
                  "tracking-wider text-xs font-medium",
                  isActive ? "text-bone-bright" : "font-mono",
                )}
              >
                {t(labelKey as any)}
              </span>
              {isActive && (
                <motion.span
                  layoutId="waflab-tab-underline"
                  className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-blood-neon shadow-[0_0_10px_rgba(255,23,68,0.7)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Panels ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait" initial={false}>
        {tab === "fingerprint" && (
          <motion.div key="fingerprint" {...PANEL_MOTION} className="space-y-3">
            {/* Target input */}
            <div className="space-y-1">
              <label className="text-xs tracking-wider text-ash font-mono">
                {t("waf.fingerprintTarget")}
              </label>
              <input
                type="text"
                spellCheck={false}
                value={fingerTarget}
                onChange={(e) => setFingerTarget(e.target.value)}
                placeholder="http://target.tld/page.php?id=1"
                className="w-full bg-void border border-blood-deep/50 px-3 py-2 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood focus:outline-none"
              />
            </div>

            {/* Scan button */}
            <button
              type="button"
              disabled={fingerLoading}
              onClick={runFingerprint}
              className={cn(
                "w-full border border-blood-deep/50 px-3 py-2 font-mono text-xs text-blood hover:text-blood-neon hover:border-blood transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {fingerLoading ? (
                <span className="inline-flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="inline-block"
                    aria-hidden
                  >
                    ⟳
                  </motion.span>
                  {t("waf.scanning")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden>⟁</span> {t("waf.scanWaf")}
                </span>
              )}
            </button>

            {/* Results */}
            <AnimatePresence>
              {fingerResult && (
                <motion.div
                  key="fp-result"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border border-blood-deep/40 bg-void/40 p-3 space-y-3 overflow-hidden"
                >
                  {fingerResult.detected ? (
                    <>
                      {/* WAF name + vendor */}
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="text-sm font-mono text-blood-neon tracking-wider">
                            {fingerResult.name}
                          </div>
                          {fingerResult.vendor && (
                            <div className="text-[10px] text-ash-dim font-mono mt-0.5">
                              {fingerResult.vendor}
                            </div>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-blood border border-blood/40 px-1.5 py-0.5">
                          {t("waf.detected")}
                        </span>
                      </div>

                      {/* Confidence bar */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono text-ash tracking-wider">
                          {t("waf.confidence")}
                        </div>
                        {confidenceBar(fingerResult.confidence)}
                      </div>

                      {/* Evidence */}
                      {fingerResult.evidence.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[10px] font-mono text-ash tracking-wider">
                            {t("waf.evidence")} [{fingerResult.evidence.length}]
                          </div>
                          <motion.ul
                            variants={STAGGER.container}
                            initial="initial"
                            animate="animate"
                            className="space-y-0.5"
                          >
                            {fingerResult.evidence.map((ev, i) => (
                              <motion.li
                                key={i}
                                variants={STAGGER.item}
                                className="text-[10px] font-mono text-bone-dim pl-3 relative before:content-['▸'] before:absolute before:left-0 before:text-blood"
                              >
                                {ev}
                              </motion.li>
                            ))}
                          </motion.ul>
                        </div>
                      )}

                      {/* All matches (lower confidence) */}
                      {fingerResult.allMatches.length > 1 && (
                        <div className="pt-1 border-t border-blood-deep/30">
                          <div className="text-[10px] font-mono text-ash-dim tracking-wider mb-1">
                            {t("waf.otherMatches")}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {fingerResult.allMatches.map((m) => (
                              <span
                                key={m.name}
                                className="text-[10px] font-mono text-ash bg-ash/5 border border-ash-dim/20 px-1.5 py-0.5"
                              >
                                {m.name} ({m.confidence}%)
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-xs font-mono text-ash text-center py-2">
                      {fingerResult.message ?? t("waf.noDetection")}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {tab === "tamper" && (
          <motion.div key="tamper" {...PANEL_MOTION} className="space-y-3">
            {/* Target input */}
            <div className="space-y-1">
              <label className="text-xs tracking-wider text-ash font-mono">
                {t("waf.fingerprintTarget")}
              </label>
              <input
                type="text"
                spellCheck={false}
                value={testTarget}
                onChange={(e) => setTestTarget(e.target.value)}
                placeholder="http://target.tld/page.php?id=1"
                className="w-full bg-void border border-blood-deep/50 px-3 py-2 font-mono text-xs text-bone placeholder:text-ash-dim focus:border-blood focus:outline-none"
              />
            </div>

            {/* Tamper list + test button */}
            <div className="border border-blood-deep/40 bg-void/40">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-blood-deep/30">
                <span className="text-xs font-mono text-bone tracking-wider">
                  {t("waf.tampersFromPicker")}{" "}
                  <span className="text-ash">[{testList.length}]</span>
                </span>
              </div>

              {/* List */}
              {testList.length === 0 ? (
                <div className="px-3 py-4 text-xs font-mono text-ash text-center">
                  {t("waf.noTampers")}
                </div>
              ) : (
                <div className="max-h-[180px] overflow-y-auto">
                  {testList.map((name) => (
                    <div
                      key={name}
                      className="flex items-center justify-between px-3 py-1.5 border-b border-blood-deep/15 last:border-b-0"
                    >
                      <span className="text-xs font-mono text-bone-dim truncate">
                        {name}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleTamper(name)}
                        aria-label={`Remove ${name}`}
                        className="text-blood hover:text-bone text-xs ml-2 flex-none"
                      >
                        ✗
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Test All button */}
            <button
              type="button"
              disabled={testLoading}
              onClick={runTamperTest}
              className={cn(
                "w-full border border-blood-deep/50 px-3 py-2 font-mono text-xs text-blood hover:text-blood-neon hover:border-blood transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {testLoading ? (
                <span className="inline-flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                    className="inline-block"
                    aria-hidden
                  >
                    ⟳
                  </motion.span>
                  {t("waf.testing")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden>⟁</span> {t("waf.testAll")}
                </span>
              )}
            </button>

            {/* Test results */}
            <AnimatePresence>
              {testResult && (
                <motion.div
                  key="tr-result"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="border border-blood-deep/40 bg-void/40 overflow-hidden"
                >
                  {/* Summary stats */}
                  <div className="px-3 py-2 border-b border-blood-deep/30 flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] font-mono text-ash tracking-wider">
                      {t("waf.summary")}
                    </span>
                    <span className="text-[10px] font-mono text-green-400">
                      {testResult.summary.passed} {t("waf.passed")}
                    </span>
                    <span className="text-[10px] font-mono text-blood">
                      {testResult.summary.blocked} {t("waf.blocked")}
                    </span>
                    <span className="text-[10px] font-mono text-ash-dim">
                      {testResult.summary.inconclusive} {t("waf.inconclusive")}
                    </span>
                  </div>

                  {/* Per-tamper results */}
                  <div className="max-h-[220px] overflow-y-auto">
                    {testResult.results.map((item, i) => (
                      <motion.div
                        key={item.name}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, duration: 0.18 }}
                        className="flex items-center justify-between px-3 py-2 border-b border-blood-deep/15 last:border-b-0 gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {statusBadge(item)}
                          <span className="text-xs font-mono text-bone-dim truncate">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-none">
                          {item.error && (
                            <span
                              className="text-[10px] font-mono text-ash-dim truncate max-w-[120px]"
                              title={item.error}
                            >
                              {item.error}
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-ash-dim tabular-nums">
                            {item.durationMs > 0
                              ? `${(item.durationMs / 1000).toFixed(1)}s`
                              : "—"}
                          </span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
