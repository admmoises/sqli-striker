"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { HelpIcon } from "@/components/HelpIcon";
import { WAF_BYPASS_TAMPERS } from "@/lib/scan-config";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface TamperInfo {
  name: string;
  description: string;
}

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

export function TamperPicker({ selected, onChange }: Props): React.ReactElement {
  const t = useT();
  const [tampers, setTampers] = useState<TamperInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sqlmap/tampers");
        const json = (await res.json()) as {
          tampers?: TamperInfo[];
          error?: string;
        };
        if (cancelled) return;
        if (json.error) setErr(json.error);
        setTampers(json.tampers ?? []);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tampers;
    return tampers.filter(
      (tx) => tx.name.toLowerCase().includes(q) || tx.description.toLowerCase().includes(q),
    );
  }, [tampers, query]);

  const toggle = (name: string): void => {
    if (selectedSet.has(name)) onChange(selected.filter((x) => x !== name));
    else onChange([...selected, name]);
  };

  const applyWafPreset = (): void => {
    const valid = WAF_BYPASS_TAMPERS.filter((n) => tampers.some((tx) => tx.name === n));
    const merged = Array.from(new Set([...selected, ...valid]));
    onChange(merged);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-sm tracking-wider text-bone font-mono font-medium">
            {t("tamper.label")}{" "}
            <span className="text-ash">
              [{selected.length}/{tampers.length || "—"}]
            </span>
          </span>
          <HelpIcon tip={t("tamper.hint")} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={applyWafPreset}
            className="text-xs tracking-wider px-2 py-1 border border-blood-deep/60 text-bone-dim hover:border-blood hover:text-blood transition-colors font-mono"
          >
            + {t("tamper.wafBypass")}
          </button>
          <HelpIcon tip={t("tamper.wafBypass.hint")} align="end" />
        </div>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 pb-1.5 border-b border-blood-deep/40">
          <AnimatePresence initial={false}>
            {selected.map((name) => (
              <motion.span
                key={name}
                layout
                initial={{ opacity: 0, x: -6, scale: 0.85 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 6, scale: 0.85 }}
                transition={{ duration: 0.14 }}
                className="inline-flex items-center gap-1 bg-blood/15 border border-blood/70 text-blood-neon px-1.5 py-0.5 font-mono text-xs"
              >
                <span>{name}</span>
                <button
                  type="button"
                  aria-label={`${t("common.remove")} ${name}`}
                  onClick={() => toggle(name)}
                  className="text-blood hover:text-bone"
                >
                  ✗
                </button>
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}

      <input
        type="text"
        spellCheck={false}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("tamper.search")}
        className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone placeholder:text-ash/60 outline-none focus:border-blood"
      />

      <div className="border border-blood-deep/40 bg-void/40 h-[180px] sm:h-[220px] overflow-y-auto">
        {loading && (
          <div className="px-2 py-2 text-xs text-ash font-mono">
            ━ {t("tamper.loading")}
          </div>
        )}
        {err && (
          <div className="px-2 py-2 text-xs text-blood font-mono">
            ! {err}
          </div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div className="px-2 py-2 text-xs text-ash font-mono">
            {t("tamper.empty")}
          </div>
        )}
        {filtered.map((tx) => {
          const active = selectedSet.has(tx.name);
          return (
            <button
              key={tx.name}
              type="button"
              onClick={() => toggle(tx.name)}
              aria-pressed={active}
              className={cn(
                "w-full text-left px-2 py-1.5 flex items-start gap-2 font-mono text-xs border-b border-blood-deep/15 transition-colors leading-relaxed",
                active ? "bg-blood/10 text-blood-neon" : "text-bone hover:bg-blood-deep/15 hover:text-bone-bright",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-block w-3 h-3 border flex-none flex items-center justify-center",
                  active ? "bg-blood border-blood-neon text-void" : "border-blood-deep/70",
                )}
              >
                {active ? <span className="text-xs leading-none">✗</span> : null}
              </span>
              <span className="flex-1 min-w-0">
                <span className={cn("block truncate", active && "text-blood-neon")}>
                  {tx.name}
                </span>
                {tx.description && (
                  <span className="block text-[10px] text-ash truncate">{tx.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
