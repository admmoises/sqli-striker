"use client";

import { useState } from "react";
import { motion } from "framer-motion";

import { HelpIcon } from "@/components/HelpIcon";
import { URL_PATTERN } from "@/lib/scan-config";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  target: string;
  onTargetChange: (v: string) => void;
  fileMode: boolean;
  onFileModeChange: (v: boolean) => void;
  requestFile: string;
  onRequestFileChange: (v: string) => void;
}

export function TargetInput({
  target,
  onTargetChange,
  fileMode,
  onFileModeChange,
  requestFile,
  onRequestFileChange,
}: Props): React.ReactElement {
  const t = useT();
  const [focus, setFocus] = useState(false);
  const valid = !fileMode && URL_PATTERN.test(target.trim());
  const invalid = !fileMode && target.length > 0 && !valid;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <label
            className={cn(
              "text-sm font-mono tracking-wider font-medium",
              focus ? "text-blood glow-red-soft" : "text-bone",
            )}
            htmlFor="target-input"
          >
            {t("target.label")}
          </label>
          <HelpIcon tip={t("target.hint")} />
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onFileModeChange(!fileMode)}
            aria-pressed={fileMode}
            className={cn(
              "text-xs tracking-wider px-2 py-1 border transition-colors font-mono",
              fileMode
                ? "border-blood text-blood bg-blood/10"
                : "border-blood-deep/60 text-ash hover:text-blood hover:border-blood",
            )}
          >
            {t("target.fileMode")} [{fileMode ? t("target.fileMode.on") : t("target.fileMode.off")}]
          </button>
          <HelpIcon tip={t("target.fileMode.hint")} align="end" />
        </div>
      </div>

      {!fileMode ? (
        <motion.div
          animate={{
            boxShadow: valid
              ? "0 0 18px rgba(255,23,68,0.55), inset 0 0 12px rgba(255,0,51,0.08)"
              : invalid
                ? "0 0 14px rgba(139,0,0,0.6), inset 0 0 8px rgba(139,0,0,0.15)"
                : "0 0 0 rgba(0,0,0,0)",
          }}
          transition={{ duration: 0.25 }}
          className={cn(
            "relative border bg-void/70 backdrop-blur-sm",
            valid ? "border-blood-neon" : invalid ? "border-blood-deep" : "border-blood-deep/50",
          )}
        >
          <div className="flex items-center">
            <span
              className={cn(
                "px-2 select-none font-mono text-sm",
                valid ? "text-blood-neon" : "text-blood-deep",
              )}
              aria-hidden
            >
              {valid ? "►" : "▍"}
            </span>
            <input
              id="target-input"
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={target}
              onChange={(e) => onTargetChange(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              placeholder={t("target.placeholder")}
              aria-invalid={invalid}
              className="flex-1 min-w-0 py-2.5 pr-3 bg-transparent text-bone placeholder:text-ash/60 font-mono text-sm tracking-tight outline-none"
            />
            <span
              className={cn(
                "px-2 text-xs tracking-wider font-mono whitespace-nowrap",
                valid ? "text-blood-neon glow-red-soft" : invalid ? "text-blood-deep" : "text-ash",
              )}
            >
              {valid ? t("target.locked") : invalid ? t("target.invalid") : t("target.standby")}
            </span>
          </div>
        </motion.div>
      ) : (
        <div className="border border-blood-deep/50 bg-void/70 p-2">
          <div className="flex items-center">
            <span className="px-2 text-blood font-mono">📁</span>
            <input
              type="text"
              spellCheck={false}
              autoComplete="off"
              value={requestFile}
              onChange={(e) => onRequestFileChange(e.target.value)}
              placeholder="/path/to/request.txt"
              className="flex-1 min-w-0 py-2 pr-3 bg-transparent text-bone placeholder:text-ash/60 font-mono text-sm outline-none"
            />
          </div>
          <p className="text-xs text-ash mt-1 px-2 leading-relaxed">
            {t("target.fileMode.hint")}
          </p>
        </div>
      )}
    </div>
  );
}
