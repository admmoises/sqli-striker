/**
 * Client-side scan configuration types & helpers — kept lean and free of
 * server-only imports so this can be consumed by the React components.
 */

export type HttpMethod = "GET" | "POST";

export type ProxyMode = "NONE" | "SINGLE" | "FILE" | "TOR";

export type PresetName =
  | "STEALTH"
  | "STANDARD"
  | "AGGRESSIVE"
  | "WAF_BYPASS"
  | "BLIND_ONLY";

export interface HeaderRow {
  id: string;
  key: string;
  value: string;
}

export interface ScanConfig {
  target: string;
  fileMode: boolean;
  requestFile: string;
  method: HttpMethod;
  data: string;
  cookie: string;
  headers: HeaderRow[];
  techniques: string;
  level: number;
  risk: number;
  tampers: string[];
  proxyMode: ProxyMode;
  proxy: string;
  proxyFile: string;
  torType: "SOCKS5" | "HTTP";
  randomAgent: boolean;
  threads: number;
  delay: number;
  timeout: number;
  retries: number;
  dbms: string;
  batch: boolean;
  flushSession: boolean;
  forms: boolean;
  crawl: number;
  extraArgs: string;
}

export const DEFAULT_CONFIG: ScanConfig = {
  target: "",
  fileMode: false,
  requestFile: "",
  method: "GET",
  data: "",
  cookie: "",
  headers: [],
  techniques: "BEUST",
  level: 1,
  risk: 1,
  tampers: [],
  proxyMode: "NONE",
  proxy: "",
  proxyFile: "",
  torType: "SOCKS5",
  randomAgent: false,
  threads: 1,
  delay: 0,
  timeout: 30,
  retries: 3,
  dbms: "",
  batch: true,
  flushSession: false,
  forms: false,
  crawl: 0,
  extraArgs: "",
};

export const WAF_BYPASS_TAMPERS: readonly string[] = [
  "space2comment",
  "space2plus",
  "between",
  "randomcase",
  "charencode",
  "apostrophenullencode",
  "charunicodeencode",
];

export const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

export function isTargetValid(cfg: ScanConfig): boolean {
  if (cfg.fileMode) return cfg.requestFile.trim().length > 0;
  return URL_PATTERN.test(cfg.target.trim());
}

/**
 * Builds the JSON payload accepted by /api/sqlmap/scan. Note: file-mode is
 * disabled at the backend level via the deny-list (-r is rejected), so we
 * deliberately don't expose request files through extraArgs here — file
 * mode in the UI just routes through `target` as a normal URL for now.
 */
export function buildScanPayload(cfg: ScanConfig): Record<string, unknown> {
  const headerObj: Record<string, string> = {};
  for (const h of cfg.headers) {
    if (h.key.trim() && h.value.trim()) headerObj[h.key.trim()] = h.value.trim();
  }
  const payload: Record<string, unknown> = {
    target: cfg.target.trim(),
    method: cfg.method,
    techniques: cfg.techniques,
    level: cfg.level,
    risk: cfg.risk,
    batch: cfg.batch,
    randomAgent: cfg.randomAgent,
    threads: cfg.threads,
    timeout: cfg.timeout,
    retries: cfg.retries,
  };
  if (cfg.data.trim()) payload.data = cfg.data.trim();
  if (cfg.cookie.trim()) payload.cookie = cfg.cookie.trim();
  if (Object.keys(headerObj).length > 0) payload.headers = headerObj;
  if (cfg.tampers.length > 0) payload.tampers = cfg.tampers;
  if (cfg.delay > 0) payload.delay = cfg.delay;
  if (cfg.dbms.trim()) payload.dbms = cfg.dbms.trim();
  if (cfg.flushSession) payload.flushSession = true;
  if (cfg.forms) payload.forms = true;
  if (cfg.crawl > 0) payload.crawl = cfg.crawl;
  if (cfg.proxyMode === "SINGLE" && cfg.proxy.trim()) payload.proxy = cfg.proxy.trim();
  if (cfg.proxyMode === "FILE" && cfg.proxyFile.trim()) payload.proxyFile = cfg.proxyFile.trim();
  if (cfg.proxyMode === "TOR") {
    payload.tor = true;
    payload.torType = cfg.torType;
  }
  const extra = cfg.extraArgs
    .trim()
    .split(/\s+/)
    .filter((s) => s.length > 0);
  if (extra.length > 0) payload.extraArgs = extra;
  return payload;
}

export const PRESETS: Record<PresetName, Partial<ScanConfig>> = {
  STEALTH: {
    level: 1,
    risk: 1,
    delay: 2,
    randomAgent: true,
    threads: 1,
  },
  STANDARD: {
    level: 1,
    risk: 1,
    threads: 1,
    delay: 0,
    randomAgent: false,
  },
  AGGRESSIVE: {
    level: 5,
    risk: 3,
    threads: 10,
    delay: 0,
    randomAgent: false,
  },
  WAF_BYPASS: {
    tampers: [...WAF_BYPASS_TAMPERS],
    randomAgent: true,
    delay: 1,
  },
  BLIND_ONLY: {
    techniques: "BT",
    level: 3,
    risk: 2,
  },
};
