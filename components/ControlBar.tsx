"use client";

import { motion } from "framer-motion";

import type { ScanStatus } from "@/lib/use-scan";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  status: ScanStatus;
  canStart: boolean;
  elapsedMs: number;
  onStart: () => void;
  onStop: () => void;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));
const fmt = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(sec)}` : `${pad2(m)}:${pad2(sec)}`;
};

const STATUS_COLOR: Record<ScanStatus, string> = {
  idle: "text-ash",
  starting: "text-blood-neon",
  scanning: "text-blood-neon",
  stopping: "text-blood",
  stopped: "text-blood",
  done: "text-blood-neon",
  error: "text-blood",
};

export function ControlBar({
  status,
  canStart,
  elapsedMs,
  onStart,
  onStop,
}: Props): React.ReactElement {
  const t = useT();
  const live =
    status === "scanning" || status === "starting" || status === "stopping";

  const STATUS_LABEL: Record<ScanStatus, string> = {
    idle: t("status.idle"),
    starting: t("status.starting"),
    scanning: t("status.scanning"),
    stopping: t("status.stopping"),
    stopped: t("status.stopped"),
    done: t("status.done"),
    error: t("status.error"),
  };

  return (
    <div className="flex flex-col gap-2">
      <motion.button
        type="button"
        disabled={live ? false : !canStart}
        onClick={live ? onStop : onStart}
        whileHover={live ? { x: [0, -2, 2, -1, 1, 0] } : { scale: 1.01 }}
        animate={
          live
            ? { x: [0, -1, 1, 0, 1, -1, 0] }
            : canStart
              ? {
                  boxShadow: [
                    "0 0 18px rgba(255,23,68,0.30)",
                    "0 0 36px rgba(255,23,68,0.55)",
                    "0 0 18px rgba(255,23,68,0.30)",
                  ],
                }
              : { boxShadow: "0 0 0 rgba(0,0,0,0)" }
        }
        transition={
          live
            ? { duration: 0.45, repeat: Infinity, ease: "linear" }
            : canStart
              ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.25 }
        }
        className={cn(
          "relative w-full py-4 sm:py-5 font-display text-3xl sm:text-4xl tracking-[0.2em] border-2 transition-colors select-none uppercase",
          live
            ? "bg-blood text-void border-blood-neon"
            : canStart
              ? "bg-blood/15 text-blood-neon border-blood hover:bg-blood hover:text-void"
              : "bg-void/40 text-ash border-blood-deep/40 cursor-not-allowed",
        )}
        aria-label={live ? t("abort.aria") : t("execute.aria")}
      >
        <span
          className={cn(canStart && !live && "glitch")}
          data-text={live ? `■ ${t("abort")}` : `► ${t("execute")}`}
        >
          {live ? `■ ${t("abort")}` : `► ${t("execute")}`}
        </span>
      </motion.button>

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-block w-2 h-2",
              live ? "bg-blood animate-pulse-red" : status === "error" ? "bg-blood" : "bg-blood-deep",
            )}
          />
          <span
            className={cn(
              "font-mono text-sm tracking-wider",
              STATUS_COLOR[status],
            )}
          >
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div className="font-display text-2xl leading-none text-bone tabular-nums">
          {fmt(elapsedMs)}
        </div>
      </div>
    </div>
  );
}
