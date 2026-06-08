"use client";

import { motion } from "framer-motion";

import { HelpIcon } from "@/components/HelpIcon";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  techniques: string;
  onChange: (v: string) => void;
}

const LETTERS = ["B", "E", "U", "S", "T", "Q"] as const;

export function TechniqueSelector({ techniques, onChange }: Props): React.ReactElement {
  const t = useT();
  const set = new Set(techniques.toUpperCase().split(""));
  const toggle = (letter: string): void => {
    const next = new Set(set);
    if (next.has(letter)) next.delete(letter);
    else next.add(letter);
    // preserve canonical BEUSTQ order
    const ordered = "BEUSTQ"
      .split("")
      .filter((c) => next.has(c))
      .join("");
    onChange(ordered);
  };
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-sm tracking-wider text-bone font-mono font-medium">
          {t("technique.label")} [{techniques.length}/6]
        </span>
        <HelpIcon tip={t("technique.hint")} />
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
        {LETTERS.map((letter) => {
          const active = set.has(letter);
          const name = t(`technique.${letter}` as const);
          return (
            <motion.button
              key={letter}
              type="button"
              role="checkbox"
              aria-checked={active}
              aria-label={`${name}`}
              onClick={() => toggle(letter)}
              whileTap={{ scale: 0.94 }}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 border transition-all duration-150 select-none",
                active
                  ? "bg-blood text-void border-blood-neon shadow-[0_0_14px_rgba(255,23,68,0.55)]"
                  : "border-blood-deep/60 border-dashed text-bone hover:border-blood hover:text-blood bg-void/40",
              )}
            >
              <span
                className={cn(
                  "font-display text-2xl leading-none",
                  active ? "text-void" : "text-bone",
                )}
              >
                {letter}
              </span>
              <span
                className={cn(
                  "font-mono text-xs tracking-wider mt-0.5",
                  active ? "text-void/70" : "text-ash",
                )}
              >
                {name}
              </span>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
