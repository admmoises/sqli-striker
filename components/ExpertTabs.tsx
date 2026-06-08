"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type ExpertTab = "target" | "technique" | "evasion" | "advanced";

const STORAGE_KEY = "expert-tab";
const ORDER: ExpertTab[] = ["target", "technique", "evasion", "advanced"];
const LABEL_KEYS: Record<ExpertTab, string> = {
  target: "tabs.target",
  technique: "tabs.technique",
  evasion: "tabs.evasion",
  advanced: "tabs.advanced",
};

interface Props {
  /** Optional small numeric/text badge per tab — string falsy = no badge. */
  badges?: Partial<Record<ExpertTab, string | null>>;
  /** Tab content keyed by tab id; only the active one is rendered. */
  panels: Record<ExpertTab, React.ReactNode>;
}

export function ExpertTabs({ badges = {}, panels }: Props): React.ReactElement {
  const t = useT();
  const [active, setActive] = useState<ExpertTab>("target");

  // Hydrate persisted tab post-mount to avoid SSR/CSR mismatch on first paint.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && (ORDER as string[]).includes(stored)) {
        setActive(stored as ExpertTab);
      }
    } catch {
      // ignore storage errors (private mode, etc.)
    }
  }, []);

  const change = (next: ExpertTab): void => {
    setActive(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-col min-h-0">
      {/* TAB BAR */}
      <div
        role="tablist"
        aria-label="expert configuration sections"
        className="flex overflow-x-auto whitespace-nowrap border-b border-blood-deep/60 -mx-1 px-1 scrollbar-thin"
        style={{ scrollbarWidth: "thin" }}
      >
        {ORDER.map((id) => {
          const isActive = active === id;
          const badge = badges[id];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const label = t(LABEL_KEYS[id] as any);
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tab-panel-${id}`}
              id={`tab-${id}`}
              onClick={() => change(id)}
              className={cn(
                "relative px-3 py-2.5 flex items-center justify-center gap-1.5 flex-1 min-w-[88px]",
                "transition-colors select-none focus:outline-none",
                "border-r border-blood-deep/40 last:border-r-0",
                isActive
                  ? "bg-[rgba(255,0,51,0.15)] text-bone-bright"
                  : [
                      "text-bone hover:text-blood-neon",
                      "hover:bg-[rgba(255,0,51,0.05)]",
                    ],
              )}
            >
              <span
                className={cn(
                  "tracking-wider text-sm leading-none font-medium",
                  isActive
                    ? "font-display text-base tracking-wider text-bone-bright"
                    : "font-mono",
                )}
              >
                {label}
              </span>
              {badge ? (
                <span
                  className={cn(
                    "font-mono text-xs px-1 py-px border leading-none",
                    isActive
                      ? "border-blood-neon text-blood-neon bg-void/60"
                      : "border-ash/40 text-ash",
                  )}
                >
                  {badge}
                </span>
              ) : null}

              {isActive && (
                <motion.span
                  layoutId="active-tab-underline"
                  className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-blood-neon shadow-[0_0_10px_rgba(255,23,68,0.7)]"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* PANEL */}
      <div className="flex-1 min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            role="tabpanel"
            id={`tab-panel-${active}`}
            aria-labelledby={`tab-${active}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
            className="pt-4"
          >
            {panels[active]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
