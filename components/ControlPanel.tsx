"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { type Locale, setLocale, useLocale, useT } from "@/lib/i18n";

import { AdvancedPanel } from "@/components/AdvancedPanel";
import { BootSequence } from "@/components/BootSequence";
import { ControlBar } from "@/components/ControlBar";
import { ExpertTabs } from "@/components/ExpertTabs";
import { HelpDrawer } from "@/components/HelpDrawer";
import { LeakScanner } from "@/components/LeakScanner";
import { LevelRiskSliders } from "@/components/LevelRiskSliders";
import { MethodPanel } from "@/components/MethodPanel";
import { OutputStream } from "@/components/OutputStream";
import { PresetPicker } from "@/components/PresetPicker";
import { ProxyConfig } from "@/components/ProxyConfig";
import { QueuePanel } from "@/components/QueuePanel";
import { ResultsPanel } from "@/components/ResultsPanel";
import { StatusFooter } from "@/components/StatusFooter";
import { TamperPicker } from "@/components/TamperPicker";
import { TargetInput } from "@/components/TargetInput";
import { TechniqueSelector } from "@/components/TechniqueSelector";
import { WafLab } from "@/components/WafLab";
import {
  DEFAULT_CONFIG,
  PRESETS,
  buildScanPayload,
  isTargetValid,
  type PresetName,
  type ScanConfig,
} from "@/lib/scan-config";
import { useScan } from "@/lib/use-scan";

interface CheckResp {
  installed: boolean;
  version: string;
  path: string;
  tamperDir: string;
  tamperDirExists: boolean;
  error?: string;
}

const panelMotion = (delay = 0) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: [0.2, 0.7, 0.2, 1] as const },
});

type UiMode = "simple" | "expert";
const MODE_STORAGE_KEY = "gui-mode";

function ModeToggle({
  mode,
  onChange,
}: {
  mode: UiMode;
  onChange: (next: UiMode) => void;
}): React.ReactElement {
  const t = useT();
  return (
    <div
      role="radiogroup"
      aria-label={t("mode.aria")}
      className="flex items-center gap-0 border border-blood-deep/70 bg-void/70 p-0.5"
    >
      {(["simple", "expert"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(m)}
            className={cn(
              "relative px-3 py-1.5 font-mono text-xs tracking-wider transition-colors select-none",
              active ? "text-void" : "text-bone hover:text-blood-neon",
            )}
          >
            {active && (
              <motion.span
                layoutId="mode-pill"
                className="absolute inset-0 bg-blood shadow-[0_0_12px_rgba(255,23,68,0.55)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">
              {m === "simple" ? t("mode.simple") : t("mode.expert")}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function LocaleToggle(): React.ReactElement {
  const locale = useLocale();
  return (
    <div
      role="radiogroup"
      aria-label="locale"
      className="flex items-center gap-0 border border-blood-deep/70 bg-void/70 p-0.5"
    >
      {(["en", "pt"] as const).map((l) => {
        const active = locale === l;
        return (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(l)}
            className={cn(
              "relative px-2.5 py-1.5 font-mono text-xs tracking-wider transition-colors select-none uppercase",
              active ? "text-void" : "text-bone hover:text-blood-neon",
            )}
          >
            {active && (
              <motion.span
                layoutId="locale-pill"
                className="absolute inset-0 bg-blood shadow-[0_0_12px_rgba(255,23,68,0.55)]"
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
              />
            )}
            <span className="relative">{l === "en" ? "EN" : "PT-BR"}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ControlPanel(): React.ReactElement {
  const t = useT();
  const [cfg, setCfg] = useState<ScanConfig>(DEFAULT_CONFIG);
  const [activePreset, setActivePreset] = useState<PresetName | null>(null);
  const [check, setCheck] = useState<CheckResp | null>(null);
  const [bootDone, setBootDone] = useState(false);
  const [mode, setMode] = useState<UiMode>("simple");
  const [helpOpen, setHelpOpen] = useState(false);

  // Hydrate UI mode from localStorage on mount. We default to "simple" SSR
  // side and only flip to "expert" client-side once we read storage, so the
  // first paint matches server output.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
      if (stored === "simple" || stored === "expert") setMode(stored);
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, []);

  const changeMode = useCallback((next: UiMode): void => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  // Destructure so onExecute / onAbort can depend on the stable callback refs
  // instead of a fresh `scan` object on every render (which busts memo deps).
  const { state, start, stop, clear } = useScan();
  const live =
    state.status === "scanning" ||
    state.status === "starting" ||
    state.status === "stopping";

  // Initial sqlmap health check (drives footer + status strip).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/sqlmap/check");
        const j = (await r.json()) as CheckResp;
        if (!cancelled) setCheck(j);
      } catch {
        // best-effort
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Boot animation lifecycle — once finished, allow the rest of the UI to
  // continue staging in. The boot sequence runs ~1.2s total; we wait a beat.
  useEffect(() => {
    const t = setTimeout(() => setBootDone(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Patch helper — every config field uses this.
  const patch = useCallback(<K extends keyof ScanConfig>(k: K, v: ScanConfig[K]): void => {
    setCfg((c) => ({ ...c, [k]: v }));
    setActivePreset(null);
  }, []);

  const applyPreset = useCallback((p: PresetName): void => {
    // Reset to defaults so switching presets doesn't carry over fields the
    // previous preset overrode (e.g. AGGRESSIVE threads=10 leaking into
    // STEALTH). Preserve fields the user filled in themselves: target,
    // file mode, request body, cookie, headers.
    setCfg((c) => ({
      ...DEFAULT_CONFIG,
      target: c.target,
      fileMode: c.fileMode,
      requestFile: c.requestFile,
      method: c.method,
      data: c.data,
      cookie: c.cookie,
      headers: c.headers,
      ...PRESETS[p],
    }));
    setActivePreset(p);
    toast.success(t("toast.preset", { name: p.replace("_", " ") }), {
      duration: 1300,
    });
  }, [t]);

  const targetOk = isTargetValid(cfg);

  const onExecute = useCallback(async () => {
    if (!targetOk) {
      toast.error(t("toast.invalidTarget"));
      return;
    }
    toast.success(t("toast.started"));
    await start(buildScanPayload(cfg));
  }, [cfg, start, targetOk, t]);

  const onAbort = useCallback(async () => {
    toast.message(t("toast.aborting"));
    await stop();
  }, [stop, t]);

  // Surface scan status changes as toasts.
  const status = state.status;
  useEffect(() => {
    if (status === "done") toast.success(t("toast.completed"));
    else if (status === "stopped") toast.warning(t("toast.aborted"));
    else if (status === "error" && state.error) toast.error(state.error);
  }, [status, state.error, t]);

  // EXPERT-tab badges. Each tab gets a small counter when its section has
  // user-modified state. Cheap to compute, no useMemo overhead needed.
  const tabBadges = useMemo<Partial<Record<"target" | "technique" | "evasion" | "advanced", string | null>>>(() => {
    const headerCount = cfg.headers.filter((h) => h.key.trim() && h.value.trim()).length;
    const cookieCount = cfg.cookie.trim().length > 0 ? 1 : 0;
    const targetN = headerCount + cookieCount;

    const evasionN =
      cfg.tampers.length +
      (cfg.proxyMode !== "NONE" ? 1 : 0) +
      (cfg.randomAgent ? 1 : 0);

    const advancedActive =
      cfg.threads !== DEFAULT_CONFIG.threads ||
      cfg.delay > 0 ||
      cfg.timeout !== DEFAULT_CONFIG.timeout ||
      cfg.retries !== DEFAULT_CONFIG.retries ||
      cfg.dbms.trim().length > 0 ||
      cfg.flushSession ||
      cfg.forms ||
      cfg.crawl > 0 ||
      cfg.extraArgs.trim().length > 0;

    return {
      target: targetN > 0 ? String(targetN) : null,
      technique: `${cfg.level}/${cfg.risk}`,
      evasion: evasionN > 0 ? String(evasionN) : null,
      advanced: advancedActive ? "•" : null,
    };
  }, [cfg]);

  // Top-of-page DBMS chip — pulls from parsed results lazily.
  const detectedDbms = useMemo(() => {
    const stdout = state.lines.filter((l) => !l.err).map((l) => l.text);
    for (const ln of stdout) {
      const m = ln.match(/back-end DBMS:\s+(.+?)$/i);
      if (m) return m[1].trim();
    }
    return null;
  }, [state.lines]);

  // Screen-reader status announcer — only fires on terminal scan transitions
  // to avoid spamming AT users with every line of sqlmap output. Replaces
  // the previous aria-live region on the noisy output stream itself.
  const srAnnouncement = useMemo(() => {
    if (status === "done") return `${t("toast.completed")} (${state.exitCode ?? 0})`;
    if (status === "stopped") return t("toast.aborted");
    if (status === "error") return state.error ? `${t("toast.failed")}: ${state.error}` : t("toast.failed");
    return "";
  }, [status, state.exitCode, state.error, t]);

  const headerTagLabel = live
    ? t("header.engaged")
    : targetOk
      ? t("header.targetLocked")
      : t("header.awaitingTarget");

  return (
    <main className="relative min-h-screen flex flex-col text-bone">
      {/* TOP BAR */}
      <header className="border-b border-blood-deep/60 bg-void/70 backdrop-blur-sm animate-flicker">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-3 gap-y-3">
          <div className="min-w-0">
            <div className="text-blood glow-red font-display text-xl sm:text-2xl tracking-[0.18em] leading-none chromatic">
              SQLI <span className="text-blood-neon">⟁</span> STRIKER
            </div>
            <div className="text-[11px] tracking-wider text-bone-dim mt-1">
              {t("header.subtitle")} · v0.1.0
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 sm:gap-3">
            <LocaleToggle />
            <ModeToggle mode={mode} onChange={changeMode} />
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-label={t("help.open")}
              title={t("help.title")}
              className={cn(
                "inline-flex items-center justify-center w-8 h-8 border border-blood-deep/70",
                "text-ash hover:text-blood-neon hover:border-blood transition-colors",
                "font-mono text-sm",
              )}
            >
              ?
            </button>
            <a
              href="/enum"
              className="hidden md:inline-flex items-center gap-1 border border-blood-deep/70 px-3 py-1.5 text-xs font-mono tracking-wider text-ash hover:text-blood-neon hover:border-blood transition-colors"
            >
              <span className="text-blood">⟁</span> ENUM
            </a>
            <div className="hidden md:flex flex-col items-end gap-0.5 text-[11px] tracking-wider text-bone-dim font-mono">
              <span className="text-blood glow-red-soft">
                ⟁ CONTROL <span className="cursor-blink"></span>
              </span>
              <span
                className={cn(
                  "uppercase tracking-wider",
                  targetOk ? "text-blood-neon" : "text-bone-dim",
                )}
              >
                [ {headerTagLabel} ]
              </span>
            </div>
          </div>
        </div>
        <div className="divider-x" />
      </header>

      {/* STATUS STRIP */}
      <section className="border-b border-blood-deep/40 bg-ink/60">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 px-4 sm:px-6 py-2 text-xs tracking-wider text-ash font-mono">
          <div className="truncate">
            <span className="text-bone-dim uppercase">{t("strip.pid")} </span>
            <span className="text-blood">::</span>{" "}
            <span className="text-bone">
              {state.scanId ? state.scanId.slice(0, 8) : "--"}
            </span>
          </div>
          <div className="truncate">
            <span className="text-bone-dim uppercase">{t("strip.scan")} </span>
            <span className="text-blood">::</span>{" "}
            <span className="text-bone">{state.status}</span>
          </div>
          <div className="truncate">
            <span className="text-bone-dim uppercase">{t("strip.dbms")} </span>
            <span className="text-blood">::</span>{" "}
            <span className={detectedDbms ? "text-blood-neon" : "text-bone"}>
              {detectedDbms ?? t("strip.unknown")}
            </span>
          </div>
          <div className="md:text-right truncate">
            <span className="text-bone-dim uppercase">{t("strip.lines")} </span>
            <span className="text-blood">::</span>{" "}
            <span className="text-bone">{state.lines.length}</span>
          </div>
        </div>
      </section>

      {/* MAIN GRID */}
      {mode === "expert" ? (
        <>
          {/* EXPERT MAIN GRID */}
          <section
            key="expert-grid"
            className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-4 p-3 sm:p-4 lg:p-6"
          >
          {/* LEFT — config (tabbed) */}
          <motion.aside
            {...panelMotion(0.05)}
            className="lg:col-span-4 xl:col-span-3 bracket-corners bg-void/40 p-3 sm:p-4 overflow-y-auto lg:max-h-[calc(100vh-200px)]"
          >
            <div className="text-sm font-display tracking-wider text-bone pb-3 uppercase">
              <span className="text-blood">▍</span> {t("common.configuration")}
            </div>

            <ExpertTabs
              badges={tabBadges}
              panels={{
                target: (
                  <div className="space-y-5 pb-2">
                    <div className="pt-2">
                      <TargetInput
                        target={cfg.target}
                        onTargetChange={(v) => patch("target", v)}
                        fileMode={cfg.fileMode}
                        onFileModeChange={(v) => patch("fileMode", v)}
                        requestFile={cfg.requestFile}
                        onRequestFileChange={(v) => patch("requestFile", v)}
                      />
                    </div>
                    <div className="border-t border-ash/30" />
                    <MethodPanel
                      method={cfg.method}
                      onMethodChange={(v) => patch("method", v)}
                      data={cfg.data}
                      onDataChange={(v) => patch("data", v)}
                      cookie={cfg.cookie}
                      onCookieChange={(v) => patch("cookie", v)}
                      headers={cfg.headers}
                      onHeadersChange={(v) => patch("headers", v)}
                    />
                  </div>
                ),
                technique: (
                  <div className="space-y-5 pb-2">
                    <div className="pt-2">
                      <PresetPicker active={activePreset} onPick={applyPreset} />
                    </div>
                    <div className="border-t border-ash/30" />
                    <TechniqueSelector
                      techniques={cfg.techniques}
                      onChange={(v) => patch("techniques", v)}
                    />
                    <div className="border-t border-ash/30" />
                    <LevelRiskSliders
                      level={cfg.level}
                      risk={cfg.risk}
                      onLevelChange={(v) => patch("level", v)}
                      onRiskChange={(v) => patch("risk", v)}
                    />
                  </div>
                ),
                evasion: (
                  <div className="space-y-5 pb-2">
                    <div className="pt-2">
                      <TamperPicker
                        selected={cfg.tampers}
                        onChange={(v) => patch("tampers", v)}
                      />
                    </div>
                    <div className="border-t border-ash/30" />
                    <ProxyConfig
                      mode={cfg.proxyMode}
                      onModeChange={(v) => patch("proxyMode", v)}
                      proxy={cfg.proxy}
                      onProxyChange={(v) => patch("proxy", v)}
                      proxyFile={cfg.proxyFile}
                      onProxyFileChange={(v) => patch("proxyFile", v)}
                      torType={cfg.torType}
                      onTorTypeChange={(v) => patch("torType", v)}
                      randomAgent={cfg.randomAgent}
                      onRandomAgentChange={(v) => patch("randomAgent", v)}
                    />
                  </div>
                ),
                advanced: (
                  <div className="pt-2 pb-2">
                    <AdvancedPanel
                      flat
                      threads={cfg.threads}
                      onThreadsChange={(v) => patch("threads", v)}
                      delay={cfg.delay}
                      onDelayChange={(v) => patch("delay", v)}
                      timeout={cfg.timeout}
                      onTimeoutChange={(v) => patch("timeout", v)}
                      retries={cfg.retries}
                      onRetriesChange={(v) => patch("retries", v)}
                      dbms={cfg.dbms}
                      onDbmsChange={(v) => patch("dbms", v)}
                      batch={cfg.batch}
                      onBatchChange={(v) => patch("batch", v)}
                      flushSession={cfg.flushSession}
                      onFlushSessionChange={(v) => patch("flushSession", v)}
                      forms={cfg.forms}
                      onFormsChange={(v) => patch("forms", v)}
                      crawl={cfg.crawl}
                      onCrawlChange={(v) => patch("crawl", v)}
                      extraArgs={cfg.extraArgs}
                      onExtraArgsChange={(v) => patch("extraArgs", v)}
                    />
                  </div>
                ),
              }}
            />
          </motion.aside>

          {/* CENTER — output + control */}
          <motion.section
            {...panelMotion(0.15)}
            className="lg:col-span-5 xl:col-span-6 bracket-corners bg-void/60 p-3 sm:p-4 flex flex-col min-h-[420px] lg:max-h-[calc(100vh-200px)]"
          >
            <div className="mb-3">
              <ControlBar
                status={state.status}
                canStart={targetOk && !live}
                elapsedMs={state.elapsedMs}
                onStart={onExecute}
                onStop={onAbort}
              />
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              {state.lines.length === 0 && !bootDone ? (
                <div className="flex-1 min-h-0 border border-blood-deep/40 bg-void/80 p-3 overflow-hidden scanlines">
                  <BootSequence />
                </div>
              ) : (
                <OutputStream state={state} onClear={clear} />
              )}
            </div>
          </motion.section>

          {/* RIGHT — results */}
          <motion.aside
            {...panelMotion(0.25)}
            className="lg:col-span-3 bracket-corners bg-void/40 p-3 sm:p-4 flex flex-col min-h-[360px] lg:max-h-[calc(100vh-200px)]"
          >
            <ResultsPanel lines={state.lines} />
          </motion.aside>
        </section>

        {/* LABS ROW — Queue + WAF */}
        <section className="lg:grid lg:grid-cols-2 gap-3 lg:gap-4 px-3 sm:px-4 lg:px-6 pb-3 lg:pb-6">
          <motion.div {...panelMotion(0.3)} className="bracket-corners bg-void/40 p-3 sm:p-4">
            <QueuePanel
              onRunItem={(item) => {
                patch("target", item.target);
                if (item.config && typeof item.config === "object") {
                  const c = item.config as Partial<ScanConfig>;
                  if (c.method) patch("method", c.method);
                  if (c.data) patch("data", c.data);
                  if (c.cookie) patch("cookie", c.cookie);
                }
              }}
              currentScanId={state.scanId}
              isLive={live}
            />
          </motion.div>
          <motion.div {...panelMotion(0.35)} className="bracket-corners bg-void/40 p-3 sm:p-4">
            <WafLab target={cfg.target} tampers={cfg.tampers} />
          </motion.div>
        </section>

        {/* LEAK SCANNER — full-width recon */}
        <motion.div {...panelMotion(0.4)} className="bracket-corners bg-void/40 p-3 sm:p-4 mx-3 sm:mx-4 lg:mx-6 mb-3 lg:mb-6">
          <LeakScanner />
        </motion.div>
        </>
      ) : (
        <>
          {/* SIMPLE LAYOUT — target full-width, presets row, big output + results,
              prominent EXECUTE bar at the bottom. State is preserved across mode
              switches; the advanced controls just stay hidden. */}
          <section
            key="simple-grid"
          className="flex-1 flex flex-col gap-4 p-3 sm:p-5 lg:p-8 lg:gap-6"
        >
          <motion.div
            {...panelMotion(0.05)}
            className="bracket-corners bg-void/40 p-4 sm:p-5 lg:p-6 space-y-4"
          >
            <div className="[&_input]:!text-base [&_input]:!py-3.5">
              <TargetInput
                target={cfg.target}
                onTargetChange={(v) => patch("target", v)}
                fileMode={cfg.fileMode}
                onFileModeChange={(v) => patch("fileMode", v)}
                requestFile={cfg.requestFile}
                onRequestFileChange={(v) => patch("requestFile", v)}
              />
            </div>

            <PresetPicker active={activePreset} onPick={applyPreset} />

            <div className="text-xs font-mono text-ash tracking-wider pt-1">
              {t("hint.switchExpert")}
            </div>
          </motion.div>

          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-3 lg:gap-5">
            <motion.section
              {...panelMotion(0.15)}
              className="lg:col-span-8 xl:col-span-9 bracket-corners bg-void/60 p-3 sm:p-4 flex flex-col min-h-[360px] max-h-[60vh] lg:max-h-[calc(100vh-340px)]"
            >
              <div className="flex-1 min-h-0 flex flex-col">
                {state.lines.length === 0 && !bootDone ? (
                  <div className="flex-1 min-h-0 border border-blood-deep/40 bg-void/80 p-3 overflow-hidden scanlines">
                    <BootSequence />
                  </div>
                ) : (
                  <OutputStream state={state} onClear={clear} />
                )}
              </div>
            </motion.section>

            <motion.aside
              {...panelMotion(0.25)}
              className="lg:col-span-4 xl:col-span-3 bracket-corners bg-void/40 p-3 sm:p-4 flex flex-col min-h-[280px] max-h-[50vh] lg:max-h-[calc(100vh-340px)]"
            >
              <ResultsPanel lines={state.lines} />
            </motion.aside>
          </div>

          <motion.div
            {...panelMotion(0.2)}
            className="bracket-corners bg-void/60 p-3 sm:p-4 lg:p-5"
          >
            <ControlBar
              status={state.status}
              canStart={targetOk && !live}
              elapsedMs={state.elapsedMs}
              onStart={onExecute}
              onStop={onAbort}
            />
          </motion.div>
        </section>

        {/* LABS ROW — Queue + WAF */}
        <section className="lg:grid lg:grid-cols-2 gap-3 lg:gap-4 px-3 sm:px-5 lg:px-8">
          <motion.div {...panelMotion(0.3)} className="bracket-corners bg-void/40 p-3 sm:p-4">
            <QueuePanel
              onRunItem={(item) => {
                patch("target", item.target);
                if (item.config && typeof item.config === "object") {
                  const c = item.config as Partial<ScanConfig>;
                  if (c.method) patch("method", c.method);
                  if (c.data) patch("data", c.data);
                  if (c.cookie) patch("cookie", c.cookie);
                }
              }}
              currentScanId={state.scanId}
              isLive={live}
            />
          </motion.div>
          <motion.div {...panelMotion(0.35)} className="bracket-corners bg-void/40 p-3 sm:p-4">
            <WafLab target={cfg.target} tampers={cfg.tampers} />
          </motion.div>
        </section>

        {/* LEAK SCANNER — full-width recon */}
        <motion.div {...panelMotion(0.4)} className="bracket-corners bg-void/40 p-3 sm:p-4 mx-3 sm:mx-5 lg:mx-8">
          <LeakScanner />
        </motion.div>
        </>
      )}

      {/* SR-only live region — announces only terminal scan transitions so
          screen reader users get scan completion without being drowned by
          every stdout line. */}
      <div role="status" aria-live="polite" className="sr-only">
        {srAnnouncement}
      </div>

      <StatusFooter
        state={state}
        sqlmapVersion={check?.version ?? null}
        sqlmapInstalled={check?.installed ?? false}
        torEnabled={cfg.proxyMode === "TOR"}
      />

      <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  );
}

// Suppress unused import warning when Locale type is unused locally.
export type { Locale };
