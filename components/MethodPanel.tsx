"use client";

import { AnimatePresence, motion } from "framer-motion";

import { HelpIcon } from "@/components/HelpIcon";
import type { HeaderRow, HttpMethod } from "@/lib/scan-config";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  method: HttpMethod;
  onMethodChange: (m: HttpMethod) => void;
  data: string;
  onDataChange: (v: string) => void;
  cookie: string;
  onCookieChange: (v: string) => void;
  headers: HeaderRow[];
  onHeadersChange: (h: HeaderRow[]) => void;
}

let _hid = 0;
const nextHid = (): string => `h-${Date.now()}-${++_hid}`;

export function MethodPanel({
  method,
  onMethodChange,
  data,
  onDataChange,
  cookie,
  onCookieChange,
  headers,
  onHeadersChange,
}: Props): React.ReactElement {
  const t = useT();
  const addHeader = (): void => {
    onHeadersChange([...headers, { id: nextHid(), key: "", value: "" }]);
  };
  const updateHeader = (id: string, patch: Partial<HeaderRow>): void => {
    onHeadersChange(headers.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };
  const removeHeader = (id: string): void => {
    onHeadersChange(headers.filter((h) => h.id !== id));
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-sm tracking-wider text-bone font-mono font-medium">
            {t("method.label")}
          </span>
          <HelpIcon tip={t("method.hint")} />
        </div>
        <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t("method.label")}>
          {(["GET", "POST"] as const).map((m) => {
            const active = method === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onMethodChange(m)}
                className={cn(
                  "py-2 font-display text-base tracking-wider border transition-all duration-150 select-none",
                  active
                    ? "bg-blood text-void border-blood-neon shadow-[0_0_18px_rgba(255,23,68,0.45)]"
                    : "bg-void/40 text-bone border-blood-deep/50 hover:border-blood hover:text-blood-neon",
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {method === "POST" && (
          <motion.div
            key="postdata"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-sm tracking-wider text-bone font-mono font-medium">
                {t("method.body")}
              </span>
              <HelpIcon tip={t("method.body.hint")} />
            </div>
            <textarea
              rows={3}
              spellCheck={false}
              value={data}
              onChange={(e) => onDataChange(e.target.value)}
              placeholder={t("method.body.placeholder")}
              className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone placeholder:text-ash/60 outline-none focus:border-blood resize-y leading-relaxed"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-sm tracking-wider text-bone font-mono font-medium">
            {t("method.cookie")}
          </span>
          <HelpIcon tip={t("method.cookie.hint")} />
        </div>
        <input
          type="text"
          spellCheck={false}
          value={cookie}
          onChange={(e) => onCookieChange(e.target.value)}
          placeholder={t("method.cookie.placeholder")}
          className="w-full bg-void/60 border border-blood-deep/50 px-2 py-1.5 font-mono text-sm text-bone placeholder:text-ash/60 outline-none focus:border-blood"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-sm tracking-wider text-bone font-mono font-medium">
              {t("method.headers")} [{headers.length}]
            </span>
            <HelpIcon tip={t("method.headers.hint")} />
          </div>
          <button
            type="button"
            onClick={addHeader}
            className="text-xs tracking-wider px-2 py-1 border border-blood-deep/60 text-bone-dim hover:border-blood hover:text-blood transition-colors font-mono"
          >
            + {t("method.headers.add")}
          </button>
        </div>
        <AnimatePresence initial={false}>
          {headers.map((h) => (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
              className="grid grid-cols-[1fr_1.4fr_auto] gap-1 mb-1"
            >
              <input
                aria-label={t("method.headers.key")}
                type="text"
                spellCheck={false}
                value={h.key}
                onChange={(e) => updateHeader(h.id, { key: e.target.value })}
                placeholder={t("method.headers.key")}
                className="bg-void/60 border border-blood-deep/40 px-1.5 py-1 font-mono text-xs text-bone placeholder:text-ash/60 outline-none focus:border-blood"
              />
              <input
                aria-label={t("method.headers.value")}
                type="text"
                spellCheck={false}
                value={h.value}
                onChange={(e) => updateHeader(h.id, { value: e.target.value })}
                placeholder={t("method.headers.value")}
                className="bg-void/60 border border-blood-deep/40 px-1.5 py-1 font-mono text-xs text-bone placeholder:text-ash/60 outline-none focus:border-blood"
              />
              <button
                type="button"
                aria-label={t("common.remove")}
                onClick={() => removeHeader(h.id)}
                className="px-1.5 border border-blood-deep/40 text-blood-deep hover:text-blood hover:border-blood text-xs"
              >
                ✗
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
