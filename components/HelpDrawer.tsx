"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Modal drawer with a quick-reference cheatsheet. Closes on ESC, on backdrop
 * click, and via the explicit close button. Renders nothing when closed.
 */
export function HelpDrawer({ open, onClose }: Props): React.ReactElement {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="help-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={t("help.title")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-void/85 backdrop-blur-sm pt-[6vh] pb-6 px-4 overflow-y-auto"
        >
          <motion.div
            key="help-panel"
            initial={{ opacity: 0, y: 12, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "relative w-full max-w-[640px] bg-ink border border-blood/70",
              "shadow-[0_0_40px_rgba(255,0,51,0.25)] bracket-corners",
            )}
          >
            <header className="flex items-center justify-between px-5 py-3 border-b border-blood-deep/60 gap-2">
              <div className="flex flex-col min-w-0">
                <span className="font-display text-lg tracking-wider text-blood glow-red leading-none">
                  SQLMAP <span className="text-blood-neon">⟁</span> {t("help.title")}
                </span>
                <span className="text-xs tracking-wider text-ash font-mono mt-1">
                  {t("help.cheatsheet")} · v0.1.0
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("help.close")}
                className={cn(
                  "w-8 h-8 inline-flex items-center justify-center border border-blood-deep/70",
                  "text-bone hover:text-blood-neon hover:border-blood transition-colors font-mono",
                )}
              >
                ✗
              </button>
            </header>

            <div className="px-5 py-4 max-h-[70vh] overflow-y-auto space-y-5 font-mono text-sm text-bone">
              <Section title={t("help.modes")}>
                <Row name={t("mode.simple")}>
                  {t("help.simpleDesc")}
                </Row>
                <Row name={t("mode.expert")}>
                  {t("help.expertDesc")}
                </Row>
              </Section>

              <Divider />

              <Section title={t("help.expertTabs")}>
                <Row name={t("tabs.target")}>
                  {t("help.targetDesc")}
                </Row>
                <Row name={t("tabs.technique")}>
                  {t("help.techniqueDesc")}
                </Row>
                <Row name={t("tabs.evasion")}>
                  {t("help.evasionDesc")}
                </Row>
                <Row name={t("tabs.advanced")}>
                  {t("help.advancedDesc")}
                </Row>
              </Section>

              <Divider />

              <Section title={t("help.presets")}>
                <Row name={t("preset.stealth")}>
                  {t("preset.stealth.desc")}
                </Row>
                <Row name={t("preset.standard")}>{t("preset.standard.desc")}</Row>
                <Row name={t("preset.aggressive")}>
                  {t("preset.aggressive.desc")}
                </Row>
                <Row name={t("preset.waf")}>
                  {t("preset.waf.desc")}
                </Row>
                <Row name={t("preset.blind")}>
                  {t("preset.blind.desc")}
                </Row>
              </Section>

              <Divider />

              <Section title={t("help.techniques")}>
                <Row name="B">{t("technique.B")}</Row>
                <Row name="E">{t("technique.E")}</Row>
                <Row name="U">{t("technique.U")}</Row>
                <Row name="S">{t("technique.S")}</Row>
                <Row name="T">{t("technique.T")}</Row>
                <Row name="Q">{t("technique.Q")}</Row>
              </Section>

              <Divider />

              <Section title={t("help.shortcuts")}>
                <Row name="ESC">{t("help.kbEsc")}</Row>
                <Row name="TAB">{t("help.kbTab")}</Row>
                <Row name="↑ / ↓">{t("help.kbArrow")}</Row>
              </Section>

              <Divider />

              <Section title={t("help.links")}>
                <a
                  href="https://github.com/sqlmapproject/sqlmap/wiki"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-blood-neon hover:text-bone underline decoration-blood-deep/70"
                >
                  {t("help.officialWiki")} ↗
                </a>
              </Section>
            </div>

            <footer className="px-5 py-2 border-t border-blood-deep/60 text-xs tracking-wider text-ash font-mono flex justify-between gap-2 flex-wrap">
              <span>{t("help.closeNote")}</span>
              <span>{t("footer.node")} // sao_paulo</span>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="space-y-2">
      <h3 className="text-sm tracking-wider text-blood-neon font-mono font-medium uppercase">
        <span className="text-blood">▍</span> {title}
      </h3>
      <div className="space-y-1.5 pl-3">{children}</div>
    </section>
  );
}

function Row({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-3 items-baseline">
      <span className="text-xs tracking-wider text-bone-bright font-mono uppercase">
        {name}
      </span>
      <span className="text-sm text-bone-dim leading-relaxed">{children}</span>
    </div>
  );
}

function Divider(): React.ReactElement {
  return <div className="divider-x opacity-50" />;
}
