"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useRef } from "react";

import { HelpIcon } from "@/components/HelpIcon";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface SliderProps {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}

function DiscreteSlider({ label, min, max, value, onChange, hint }: SliderProps): React.ReactElement {
  const range = max - min;
  const fillPct = ((value - min) / range) * 100;
  const trackRef = useRef<HTMLDivElement | null>(null);

  const setFromEvent = (clientX: number): void => {
    const el = trackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const raw = min + ratio * range;
    onChange(Math.round(raw));
  };

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm tracking-wider text-bone font-mono font-medium inline-flex items-center gap-1.5">
          {label}
          {hint ? <HelpIcon tip={hint} /> : null}
        </span>
        <AnimatePresence mode="popLayout">
          <motion.span
            key={value}
            initial={{ scale: 1.4, opacity: 0, color: "#ff1744" }}
            animate={{ scale: 1, opacity: 1, color: "#ffffff" }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="font-display text-3xl leading-none text-bone-bright"
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </div>
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(Math.max(min, value - 1));
          } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(Math.min(max, value + 1));
          }
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setFromEvent(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) setFromEvent(e.clientX);
        }}
        className="relative h-6 bg-void border border-blood-deep/60 cursor-pointer select-none focus:outline-none focus:border-blood"
      >
        {/* fill */}
        <div
          className="absolute inset-y-0 left-0 bg-blood/70"
          style={{
            width: `${fillPct}%`,
            boxShadow: "inset 0 0 8px rgba(255,23,68,0.5)",
          }}
        />
        {/* tick marks */}
        <div className="absolute inset-0 flex pointer-events-none">
          {Array.from({ length: range + 1 }, (_, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 border-r border-blood-deep/30 last:border-r-0",
                i === value - min ? "bg-blood-neon/20" : "",
              )}
            />
          ))}
        </div>
        {/* thumb */}
        <motion.div
          aria-hidden
          animate={{ left: `${fillPct}%` }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-blood-neon border border-bone shadow-[0_0_10px_rgba(255,23,68,0.9)] pointer-events-none"
        />
      </div>
    </div>
  );
}

interface Props {
  level: number;
  risk: number;
  onLevelChange: (n: number) => void;
  onRiskChange: (n: number) => void;
}

export function LevelRiskSliders({
  level,
  risk,
  onLevelChange,
  onRiskChange,
}: Props): React.ReactElement {
  const t = useT();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <DiscreteSlider
        label={t("slider.level")}
        min={1}
        max={5}
        value={level}
        onChange={onLevelChange}
        hint={t("slider.level.hint")}
      />
      <DiscreteSlider
        label={t("slider.risk")}
        min={1}
        max={3}
        value={risk}
        onChange={onRiskChange}
        hint={t("slider.risk.hint")}
      />
    </div>
  );
}
