"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useId, useState } from "react";

import { cn } from "@/lib/utils";

interface Props {
  tip: string;
  /** Vertical placement of the tooltip relative to the icon. */
  side?: "top" | "bottom";
  /** Horizontal alignment of the tooltip. Useful when the icon sits near a panel edge. */
  align?: "start" | "center" | "end";
  /** Optional override for the visible label of the trigger (defaults to "?"). */
  label?: string;
  className?: string;
}

/**
 * Tiny inline help affordance: a 14×14 circular "?" button that reveals a
 * dark, mono tooltip on hover/focus. Lives in the same paint tree as the
 * caller — no portal — so it inherits the parent stacking context. Callers
 * that need to escape clipping should use `side="top"` instead.
 */
export function HelpIcon({
  tip,
  side = "bottom",
  align = "center",
  label = "?",
  className,
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const id = useId();

  const alignClass =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";

  const sideClass = side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5";

  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label="help"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        // Click toggles for touch / keyboard-only use. Stop propagation so
        // we don't accidentally toggle a surrounding <label>/checkbox.
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex items-center justify-center w-[14px] h-[14px] rounded-full border",
          "border-ash/60 text-ash text-[10px] leading-none font-mono",
          "transition-colors hover:border-blood-neon hover:text-blood-neon",
          "focus:outline-none focus-visible:border-blood-neon focus-visible:text-blood-neon",
          open && "border-blood-neon text-blood-neon",
        )}
      >
        <span aria-hidden>{label}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="tooltip"
            initial={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: side === "top" ? 4 : -4 }}
            transition={{ duration: 0.12, ease: [0.2, 0.7, 0.2, 1] }}
            className={cn(
              "absolute z-50 pointer-events-none",
              "bg-ink border border-blood-deep/80 shadow-[0_0_16px_rgba(0,0,0,0.85)]",
              "px-2.5 py-2 font-mono text-[11px] leading-snug text-bone",
              "max-w-[280px] w-max whitespace-normal text-left",
              sideClass,
              alignClass,
            )}
          >
            {tip}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
