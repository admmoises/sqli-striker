"use client";

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n";

interface BootLine {
  key: string;
  delay: number;
  status?: "ok" | "warn" | "info" | "fail";
}

const SEQUENCE: BootLine[] = [
  { key: "boot.bios", delay: 60, status: "info" },
  { key: "boot.kernel", delay: 80, status: "info" },
  { key: "boot.probing", delay: 120, status: "info" },
  { key: "boot.checking", delay: 80, status: "info" },
  { key: "boot.verified", delay: 90, status: "ok" },
  { key: "boot.enumerating", delay: 120, status: "info" },
  { key: "boot.loading", delay: 90, status: "ok" },
  { key: "boot.scanmgr", delay: 110, status: "info" },
  { key: "boot.sse", delay: 80, status: "ok" },
  { key: "boot.reticle", delay: 100, status: "info" },
  { key: "boot.ready", delay: 130, status: "ok" },
  { key: "boot.awaiting", delay: 120, status: "warn" },
];

const prefix = (status?: BootLine["status"]): string => {
  if (status === "ok") return "[+]";
  if (status === "warn") return "[!]";
  if (status === "fail") return "[x]";
  return "[*]";
};

export function BootSequence(): React.ReactElement {
  const t = useT();
  const [visible, setVisible] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    let acc = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    SEQUENCE.forEach((line, idx) => {
      acc += line.delay;
      const tm = setTimeout(() => {
        if (!cancelled) setVisible(idx + 1);
      }, acc);
      timers.push(tm);
    });

    return () => {
      cancelled = true;
      for (const tm of timers) clearTimeout(tm);
    };
  }, []);

  const done = visible >= SEQUENCE.length;

  return (
    <div className="font-mono text-sm leading-relaxed select-none">
      {SEQUENCE.slice(0, visible).map((line, i) => {
        const color =
          line.status === "ok"
            ? "text-blood-neon"
            : line.status === "warn"
              ? "text-bone"
              : line.status === "fail"
                ? "text-blood"
                : "text-bone-dim";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = t(line.key as any).toUpperCase();
        return (
          <div
            key={i}
            className={`${color} whitespace-pre-wrap animate-boot-line`}
          >
            {prefix(line.status)} {text}
            {line.status === "ok" && <span className="text-blood-neon"> [ {t("boot.ok")} ]</span>}
            {line.status === "warn" && <span className="text-blood"> [ {t("boot.standby")} ]</span>}
            {line.status === "fail" && <span className="text-blood"> [ {t("boot.fail")} ]</span>}
          </div>
        );
      })}
      {!done && (
        <div className="text-blood whitespace-pre cursor-blink">{"> "}</div>
      )}
    </div>
  );
}
