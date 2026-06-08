"use client";

import { AnimatePresence, motion } from "framer-motion";

import { HelpIcon } from "@/components/HelpIcon";
import type { ProxyMode } from "@/lib/scan-config";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  mode: ProxyMode;
  onModeChange: (m: ProxyMode) => void;
  proxy: string;
  onProxyChange: (v: string) => void;
  proxyFile: string;
  onProxyFileChange: (v: string) => void;
  torType: "SOCKS5" | "HTTP";
  onTorTypeChange: (v: "SOCKS5" | "HTTP") => void;
  randomAgent: boolean;
  onRandomAgentChange: (v: boolean) => void;
}

const MODES: ProxyMode[] = ["NONE", "SINGLE", "FILE", "TOR"];

export function ProxyConfig({
  mode,
  onModeChange,
  proxy,
  onProxyChange,
  proxyFile,
  onProxyFileChange,
  torType,
  onTorTypeChange,
  randomAgent,
  onRandomAgentChange,
}: Props): React.ReactElement {
  const t = useT();
  const labelOf = (m: ProxyMode): string => {
    switch (m) {
      case "NONE":
        return t("proxy.none");
      case "SINGLE":
        return t("proxy.single");
      case "FILE":
        return t("proxy.file");
      case "TOR":
        return t("proxy.tor");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-sm tracking-wider text-bone font-mono font-medium">
          {t("proxy.label")}
        </span>
        <HelpIcon tip={t("proxy.hint")} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
        {MODES.map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onModeChange(m)}
              className={cn(
                "py-1.5 text-xs tracking-wider font-mono border transition-colors",
                active
                  ? "bg-blood text-void border-blood-neon shadow-[0_0_10px_rgba(255,23,68,0.45)]"
                  : "border-blood-deep/50 text-bone hover:border-blood hover:text-blood-neon",
              )}
            >
              {labelOf(m)}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {mode === "SINGLE" && (
          <motion.div
            key="single"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <input
              type="text"
              spellCheck={false}
              value={proxy}
              onChange={(e) => onProxyChange(e.target.value)}
              placeholder={t("proxy.url.placeholder")}
              className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone placeholder:text-ash/60 outline-none focus:border-blood"
            />
          </motion.div>
        )}
        {mode === "FILE" && (
          <motion.div
            key="file"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-1"
          >
            <input
              type="text"
              spellCheck={false}
              value={proxyFile}
              onChange={(e) => onProxyFileChange(e.target.value)}
              placeholder={t("proxy.file.placeholder")}
              className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone placeholder:text-ash/60 outline-none focus:border-blood"
            />
            <p className="text-xs text-ash leading-relaxed">
              {t("proxy.file.note")}
            </p>
          </motion.div>
        )}
        {mode === "TOR" && (
          <motion.div
            key="tor"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="space-y-1"
          >
            <div className="grid grid-cols-2 gap-1">
              {(["SOCKS5", "HTTP"] as const).map((tp) => {
                const active = torType === tp;
                return (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => onTorTypeChange(tp)}
                    className={cn(
                      "py-1 text-xs tracking-wider font-mono border transition-colors",
                      active
                        ? "bg-blood/20 text-blood-neon border-blood"
                        : "border-blood-deep/50 text-bone hover:border-blood hover:text-blood-neon",
                    )}
                  >
                    {tp}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-blood-deep leading-relaxed">
              ⚠ {t("proxy.tor.note")}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <label className="flex items-center gap-2 cursor-pointer select-none group">
        <span
          className={cn(
            "inline-block w-3.5 h-3.5 border transition-colors",
            randomAgent
              ? "bg-blood border-blood-neon"
              : "border-blood-deep/70 group-hover:border-blood",
          )}
        />
        <input
          type="checkbox"
          checked={randomAgent}
          onChange={(e) => onRandomAgentChange(e.target.checked)}
          className="sr-only"
        />
        <span className="text-sm tracking-wider font-mono text-bone group-hover:text-bone-bright">
          {t("proxy.randomAgent")}
        </span>
        <HelpIcon tip={t("proxy.randomAgent.hint")} />
      </label>
    </div>
  );
}
