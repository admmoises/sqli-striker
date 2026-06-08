"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { HelpIcon } from "@/components/HelpIcon";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  threads: number;
  onThreadsChange: (v: number) => void;
  delay: number;
  onDelayChange: (v: number) => void;
  timeout: number;
  onTimeoutChange: (v: number) => void;
  retries: number;
  onRetriesChange: (v: number) => void;
  dbms: string;
  onDbmsChange: (v: string) => void;
  batch: boolean;
  onBatchChange: (v: boolean) => void;
  flushSession: boolean;
  onFlushSessionChange: (v: boolean) => void;
  forms: boolean;
  onFormsChange: (v: boolean) => void;
  crawl: number;
  onCrawlChange: (v: number) => void;
  extraArgs: string;
  onExtraArgsChange: (v: string) => void;
  /** When true, render flat (no collapse toggle, no header). Used inside the
   * EXPERT-mode ADVANCED tab where the parent already labels the section. */
  flat?: boolean;
}

const DBMS_OPTIONS = ["", "mysql", "postgresql", "mssql", "oracle", "sqlite", "mariadb"];

function NumField({
  label,
  value,
  min,
  max,
  onChange,
  step = 1,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
}): React.ReactElement {
  return (
    <label className="block">
      <span className="flex items-center gap-1.5 text-sm tracking-wider text-bone font-mono font-medium mb-1">
        {label}
        {hint ? <HelpIcon tip={hint} /> : null}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone outline-none focus:border-blood"
      />
    </label>
  );
}

function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}): React.ReactElement {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none group py-0.5">
      <span
        className={cn(
          "inline-block w-3.5 h-3.5 border transition-colors",
          value ? "bg-blood border-blood-neon" : "border-blood-deep/70 group-hover:border-blood",
        )}
      />
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="text-sm tracking-wider font-mono text-bone group-hover:text-bone-bright">
        {label}
      </span>
      {hint ? <HelpIcon tip={hint} /> : null}
    </label>
  );
}

function AdvancedBody(props: Props): React.ReactElement {
  const t = useT();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <NumField
          label={t("advanced.threads")}
          value={props.threads}
          min={1}
          max={10}
          onChange={props.onThreadsChange}
          hint={t("advanced.threads.hint")}
        />
        <NumField
          label={`${t("advanced.delay")} (s)`}
          value={props.delay}
          min={0}
          max={60}
          onChange={props.onDelayChange}
          hint={t("advanced.delay.hint")}
        />
        <NumField
          label={t("advanced.timeout")}
          value={props.timeout}
          min={1}
          max={300}
          onChange={props.onTimeoutChange}
          hint={t("advanced.timeout.hint")}
        />
        <NumField
          label={t("advanced.retries")}
          value={props.retries}
          min={0}
          max={10}
          onChange={props.onRetriesChange}
          hint={t("advanced.retries.hint")}
        />
      </div>

      <label className="block">
        <span className="flex items-center gap-1.5 text-sm tracking-wider text-bone font-mono font-medium mb-1">
          {t("advanced.dbms")}
          <HelpIcon tip={t("advanced.dbms.hint")} />
        </span>
        <select
          value={props.dbms}
          onChange={(e) => props.onDbmsChange(e.target.value)}
          className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone outline-none focus:border-blood appearance-none"
          style={{
            backgroundImage:
              "linear-gradient(45deg, transparent 50%, #8b0000 50%), linear-gradient(135deg, #8b0000 50%, transparent 50%)",
            backgroundPosition: "calc(100% - 12px) 50%, calc(100% - 7px) 50%",
            backgroundSize: "5px 5px, 5px 5px",
            backgroundRepeat: "no-repeat",
          }}
        >
          {DBMS_OPTIONS.map((d) => (
            <option key={d || "auto"} value={d} className="bg-void text-bone">
              {d || t("advanced.dbms.auto")}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-2 gap-y-0.5">
        <Toggle
          label={t("advanced.batch")}
          value={props.batch}
          onChange={props.onBatchChange}
          hint={t("advanced.batch.hint")}
        />
        <Toggle
          label={t("advanced.flush")}
          value={props.flushSession}
          onChange={props.onFlushSessionChange}
          hint={t("advanced.flush.hint")}
        />
        <Toggle
          label={t("advanced.forms")}
          value={props.forms}
          onChange={props.onFormsChange}
          hint={t("advanced.forms.hint")}
        />
      </div>

      <NumField
        label={`${t("advanced.crawl")} (0=off)`}
        value={props.crawl}
        min={0}
        max={5}
        onChange={props.onCrawlChange}
        hint={t("advanced.crawl.hint")}
      />

      <label className="block">
        <span className="flex items-center gap-1.5 text-sm tracking-wider text-bone font-mono font-medium mb-1">
          {t("advanced.extraArgs")}
          <HelpIcon tip={t("advanced.extraArgs.hint")} />
        </span>
        <input
          type="text"
          spellCheck={false}
          value={props.extraArgs}
          onChange={(e) => props.onExtraArgsChange(e.target.value)}
          placeholder={t("advanced.extraArgs.placeholder")}
          className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone placeholder:text-ash/60 outline-none focus:border-blood"
        />
        <p className="text-xs text-ash mt-1 leading-relaxed">
          {t("advanced.extraArgs.note")}
        </p>
      </label>
    </div>
  );
}

export function AdvancedPanel(props: Props): React.ReactElement {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (props.flat) {
    return <AdvancedBody {...props} />;
  }

  return (
    <div className="border-t border-blood-deep/40 pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm tracking-wider text-bone font-mono font-medium">
          <span className="text-blood">▍</span> {t("tabs.advanced")} <span className="text-blood">⟁</span>
        </span>
        <motion.span
          aria-hidden
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="text-blood font-mono text-xs"
        >
          ▶
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="adv"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <AdvancedBody {...props} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
