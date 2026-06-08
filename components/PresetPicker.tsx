"use client";

import { motion } from "framer-motion";

import type { PresetName } from "@/lib/scan-config";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  active: PresetName | null;
  onPick: (p: PresetName) => void;
}

const PRESET_KEYS: { key: PresetName; labelKey: string; descKey: string; sub: string }[] = [
  { key: "STEALTH", labelKey: "preset.stealth", descKey: "preset.stealth.desc", sub: "low&slow" },
  { key: "STANDARD", labelKey: "preset.standard", descKey: "preset.standard.desc", sub: "default" },
  { key: "AGGRESSIVE", labelKey: "preset.aggressive", descKey: "preset.aggressive.desc", sub: "lvl5 risk3" },
  { key: "WAF_BYPASS", labelKey: "preset.waf", descKey: "preset.waf.desc", sub: "tamper kit" },
  { key: "BLIND_ONLY", labelKey: "preset.blind", descKey: "preset.blind.desc", sub: "B + T" },
];

export function PresetPicker({ active, onPick }: Props): React.ReactElement {
  const t = useT();
  return (
    <div>
      <div className="text-sm tracking-wider text-bone mb-1.5 font-mono font-medium">
        {t("preset.label")}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
        {PRESET_KEYS.map((p) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const label = t(p.labelKey as any);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const desc = t(p.descKey as any);
          const isActive = active === p.key;
          return (
            <motion.button
              key={p.key}
              type="button"
              title={desc}
              aria-label={`${label} — ${desc}`}
              onClick={() => onPick(p.key)}
              whileTap={{ scale: 0.96 }}
              className={cn(
                "py-2 px-2 flex flex-col items-center border transition-all duration-150",
                isActive
                  ? "bg-blood/20 border-blood-neon text-blood-neon shadow-[0_0_12px_rgba(255,23,68,0.4)]"
                  : "border-blood-deep/50 text-bone hover:border-blood hover:text-blood-neon",
              )}
            >
              <span className="font-display text-base leading-none tracking-wider">
                {label}
              </span>
              <span className="font-mono text-[10px] tracking-wider text-ash mt-1">
                {p.sub}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
