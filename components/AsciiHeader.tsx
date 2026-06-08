"use client";

/**
 * Static ASCII art header — "SQLI STRIKER".
 * Client component so it can localize the subtitle.
 */

import { useT } from "@/lib/i18n";

const ASCII = String.raw`
___  ___  _    ___      ___ _____ ___ ___ _  _____ ___ 
/ __|/ _ \| |  |_ _|    / __|_   _| _ \_ _| |/ / __| _ \
\__ \ (_) | |__ | |     \__ \ | | |   /| || ' <| _||   /
|___/\__\_\____|___|    |___/ |_| |_|_\___|_|\_\___|_|_\
`;

export function AsciiHeader(): React.ReactElement {
  const t = useT();
  return (
    <pre
      aria-label="SQLI STRIKER"
      className="text-blood glow-red text-[10px] sm:text-[11px] md:text-[12px] leading-[1.05] whitespace-pre select-none"
      style={{ fontFamily: "var(--font-jbmono), monospace" }}
    >
      {ASCII}
      <span className="block mt-1 text-bone-dim text-xs tracking-wider">
        {t("header.subtitle")}
      </span>
    </pre>
  );
}
