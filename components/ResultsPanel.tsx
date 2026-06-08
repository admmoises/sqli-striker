"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useDeferredValue, useMemo, useState } from "react";

import { parseResults } from "@/lib/parse-results";
import type { LogLine } from "@/lib/use-scan";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  lines: readonly LogLine[];
}

function TickNumber({ value }: { value: number }): React.ReactElement {
  return (
    <AnimatePresence mode="popLayout">
      <motion.span
        key={value}
        initial={{ y: -8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="inline-block font-display text-bone-bright text-3xl leading-none"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  );
}

export function ResultsPanel({ lines }: Props): React.ReactElement {
  const t = useT();
  // Defer the heavy parse so React can prioritize user input over the
  // 80-events-per-second sqlmap stream. The displayed snapshot can lag by
  // a frame; that's the explicit trade-off.
  const deferredLines = useDeferredValue(lines);
  const textLines = useMemo(
    () => deferredLines.filter((l) => !l.err).map((l) => l.text),
    [deferredLines],
  );
  const results = useMemo(() => parseResults(textLines), [textLines]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const dbCount = results.databases.length;
  const tableCount = Object.values(results.tables).reduce((a, b) => a + b.length, 0);
  const colCount = Object.values(results.columns).reduce((a, b) => a + b.length, 0);

  const hasAny =
    results.dbms ||
    results.databases.length > 0 ||
    results.injectionPoints.length > 0 ||
    results.webServer ||
    results.os;

  const toggle = (k: string): void =>
    setExpanded((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-sm tracking-wider text-bone font-mono font-medium">
        <span className="text-blood">▍</span> {t("results.title")}
      </div>
      <div className="divider-x my-2" />

      {/* Counter strip */}
      <div className="grid grid-cols-3 gap-1.5 mb-2">
        {[
          { label: t("results.dbs"), v: dbCount },
          { label: t("results.tables"), v: tableCount },
          { label: t("results.cols"), v: colCount },
        ].map((c) => (
          <div
            key={c.label}
            className="bracket-corners bg-void/60 py-2 px-2 text-center"
          >
            <div className="text-xs tracking-wider text-ash font-mono">
              {c.label}
            </div>
            <TickNumber value={c.v} />
          </div>
        ))}
      </div>

      {results.currentStatus && (
        <div className="mb-2 px-2 py-1.5 border border-blood-deep/40 bg-blood-deep/10">
          <div className="text-xs tracking-wider text-ash font-mono">
            {t("results.status")}
          </div>
          <div className="text-sm font-mono text-bone truncate leading-relaxed">
            {results.currentStatus}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {!hasAny && (
          <div className="text-center pt-6 select-none">
            <pre className="inline-block text-left text-blood-deep/40 leading-tight text-xs">
{`     ╔══════════════════╗
     ║                  ║
     ║  ${t("results.awaiting").toUpperCase().padEnd(15, " ")} ║
     ║                  ║
     ╚══════════════════╝`}
            </pre>
            <div className="mt-2 text-xs text-ash tracking-wider">
              {t("results.fingerprint")}
            </div>
          </div>
        )}

        {results.dbms && (
          <div>
            <div className="text-xs tracking-wider text-ash font-mono">
              {t("results.dbms")}
            </div>
            <div className="font-mono text-sm text-blood-neon glow-red-soft truncate">
              {results.dbms}
            </div>
          </div>
        )}

        {(results.webServer || results.os) && (
          <div className="grid grid-cols-1 gap-1">
            {results.webServer && (
              <div className="font-mono text-xs text-bone truncate">
                <span className="text-ash">{t("results.web")} :</span> {results.webServer}
              </div>
            )}
            {results.os && (
              <div className="font-mono text-xs text-bone truncate">
                <span className="text-ash">{t("results.os")}  :</span> {results.os}
              </div>
            )}
            {results.webTech.length > 0 && (
              <div className="font-mono text-xs text-bone truncate">
                <span className="text-ash">{t("results.tech")}:</span> {results.webTech.join(", ")}
              </div>
            )}
          </div>
        )}

        {results.injectionPoints.length > 0 && (
          <div>
            <div className="text-xs tracking-wider text-ash font-mono mb-0.5">
              {t("results.injection")}
            </div>
            <ul className="space-y-0.5">
              {results.injectionPoints.map((p) => (
                <li key={p} className="font-mono text-xs text-blood">
                  ▸ {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {results.databases.length > 0 && (
          <div>
            <div className="text-xs tracking-wider text-ash font-mono mb-0.5">
              {t("results.databases")}
            </div>
            <ul className="space-y-0.5">
              {results.databases.map((db) => {
                const tables = results.tables[db] ?? [];
                const dbKey = `db:${db}`;
                const open = expanded[dbKey] ?? true;
                return (
                  <li key={db}>
                    <button
                      type="button"
                      onClick={() => toggle(dbKey)}
                      className="w-full text-left font-mono text-sm text-bone hover:text-blood-neon flex items-center gap-1"
                    >
                      <span className="text-blood-deep">{open ? "▾" : "▸"}</span>
                      <span className="truncate">{db}</span>
                      {tables.length > 0 && (
                        <span className="text-ash text-xs">[{tables.length}]</span>
                      )}
                    </button>
                    {open && tables.length > 0 && (
                      <ul className="pl-3 mt-0.5 border-l border-blood-deep/40 space-y-0.5">
                        {tables.map((tbl) => {
                          const tKey = `t:${db}.${tbl}`;
                          const cols = results.columns[`${db}.${tbl}`] ?? [];
                          const tOpen = expanded[tKey];
                          return (
                            <li key={tbl}>
                              <button
                                type="button"
                                onClick={() => toggle(tKey)}
                                className="w-full text-left font-mono text-xs text-bone hover:text-blood-neon flex items-center gap-1"
                              >
                                <span className="text-blood-deep">{tOpen ? "▾" : "▸"}</span>
                                <span className="truncate">{tbl}</span>
                                {cols.length > 0 && (
                                  <span className="text-ash text-xs">[{cols.length}]</span>
                                )}
                              </button>
                              {tOpen && cols.length > 0 && (
                                <ul className="pl-3 mt-0.5 border-l border-blood-deep/30 space-y-0.5">
                                  {cols.map((c) => (
                                    <li
                                      key={c}
                                      className="font-mono text-xs text-ash truncate"
                                    >
                                      · {c}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {results.dumpedRows > 0 && (
          <div className="mt-2 border-t border-blood-deep/40 pt-2">
            <div className="text-xs tracking-wider text-ash font-mono">
              {t("results.dumpedRows")}
            </div>
            <div className="font-display text-3xl leading-none text-blood-neon glow-red-soft">
              {results.dumpedRows}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
