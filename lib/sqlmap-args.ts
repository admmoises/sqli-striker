/**
 * Translates a structured ScanRequest into a vetted array of sqlmap CLI args.
 *
 * Argument array (not shell string) is passed to spawn — eliminating shell
 * injection. We still validate inputs to fail loud on obviously hostile
 * values before they ever reach sqlmap.
 *
 * Trust model:
 * `extraArgs` is trust-controlled (caller passes raw sqlmap CLI flags) but
 * carries a deny-list for catastrophic flags that would escape the structured
 * API — file I/O, code eval, OS execution, request files, cookie file loads.
 * Anything on the deny-list is rejected outright; anything else still has to
 * pass the shell-metachar and SAFE_EXTRA_ARG checks below.
 */

export type HttpMethod = "GET" | "POST";

export interface ScanRequest {
  target: string;
  method?: HttpMethod;
  data?: string;
  cookie?: string;
  headers?: Record<string, string>;
  techniques?: string;
  level?: number;
  risk?: number;
  tampers?: string[];
  proxy?: string;
  proxyFile?: string;
  tor?: boolean;
  torType?: "SOCKS5" | "HTTP";
  randomAgent?: boolean;
  threads?: number;
  delay?: number;
  timeout?: number;
  retries?: number;
  dbms?: string;
  batch?: boolean;
  flushSession?: boolean;
  forms?: boolean;
  crawl?: number;
  extraArgs?: string[];
}

export interface ValidationResult {
  ok: boolean;
  args: string[];
  errors: string[];
}

const SHELL_METACHARS = /[;|&`$<>\n\r]|\$\(|`/;

// Permissive URL pattern — sqlmap also accepts request files but we keep it
// strict to a URL for now. extraArgs (-r file) can still inject a request file.
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

const TECHNIQUE_CHARS = /^[BEUSTQ]+$/i;
const TAMPER_NAME = /^[a-zA-Z0-9_]+$/;
const DBMS_NAME = /^[a-zA-Z0-9 _.\-]+$/;
const SAFE_EXTRA_ARG = /^[\w@%:/.\-+=,?&[\]{}!#"']+$/;

/**
 * Flags that escape the structured API surface: arbitrary code eval, OS
 * execution, filesystem I/O, request-file inclusion (path traversal), and
 * cookie file loading. Match is prefix-based and case-insensitive — covers
 * both `--eval=...` and `--eval ...` styles, and any future `--file-*` siblings.
 */
const DENIED_EXTRA_ARG_PREFIXES: readonly string[] = [
  "--eval",
  "--os-shell",
  "--os-pwn",
  "--os-cmd",
  "--os-bof",
  "--os-smbrelay",
  "--file-read",
  "--file-write",
  "--file-dest",
  "-r",
  "--load-cookies",
];

function isDeniedExtraArg(arg: string): string | null {
  const lower = arg.toLowerCase();
  for (const prefix of DENIED_EXTRA_ARG_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}=`) || lower.startsWith(`${prefix} `)) {
      return prefix;
    }
    // `-r<path>` (no space) is a legal sqlmap short-flag form — catch it too.
    if (prefix === "-r" && lower.startsWith("-r") && lower.length > 2 && lower[2] !== "-") {
      return prefix;
    }
  }
  return null;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function buildArgs(req: ScanRequest): ValidationResult {
  const errors: string[] = [];
  const args: string[] = [];

  // --- target ---
  if (!req.target || typeof req.target !== "string") {
    errors.push("target is required");
  } else if (!URL_PATTERN.test(req.target)) {
    errors.push("target must be a valid http(s) URL");
  } else if (SHELL_METACHARS.test(req.target)) {
    errors.push("target contains shell metacharacters");
  } else {
    args.push("-u", req.target);
  }

  // --- method / data ---
  if (req.method === "POST") {
    args.push("--method=POST");
  } else if (req.method && req.method !== "GET") {
    errors.push("method must be GET or POST");
  }

  if (req.data !== undefined) {
    if (typeof req.data !== "string" || SHELL_METACHARS.test(req.data)) {
      errors.push("data contains forbidden characters");
    } else if (req.data.length > 0) {
      args.push(`--data=${req.data}`);
    }
  }

  // --- cookie ---
  if (req.cookie) {
    if (SHELL_METACHARS.test(req.cookie)) {
      errors.push("cookie contains forbidden characters");
    } else {
      args.push(`--cookie=${req.cookie}`);
    }
  }

  // --- headers ---
  if (req.headers && typeof req.headers === "object") {
    const lines: string[] = [];
    for (const [k, v] of Object.entries(req.headers)) {
      if (!/^[A-Za-z0-9\-_]+$/.test(k)) {
        errors.push(`invalid header name: ${k}`);
        continue;
      }
      if (typeof v !== "string" || SHELL_METACHARS.test(v)) {
        errors.push(`invalid header value for ${k}`);
        continue;
      }
      lines.push(`${k}: ${v}`);
    }
    if (lines.length > 0) {
      args.push(`--headers=${lines.join("\n")}`);
    }
  }

  // --- techniques ---
  if (req.techniques) {
    if (!TECHNIQUE_CHARS.test(req.techniques)) {
      errors.push("techniques must be a subset of BEUSTQ");
    } else {
      args.push(`--technique=${req.techniques.toUpperCase()}`);
    }
  }

  // --- level / risk ---
  if (typeof req.level === "number") {
    args.push(`--level=${clamp(Math.floor(req.level), 1, 5)}`);
  }
  if (typeof req.risk === "number") {
    args.push(`--risk=${clamp(Math.floor(req.risk), 1, 3)}`);
  }

  // --- tampers ---
  if (req.tampers && Array.isArray(req.tampers) && req.tampers.length > 0) {
    const valid = req.tampers.filter((t) => typeof t === "string" && TAMPER_NAME.test(t));
    const rejected = req.tampers.filter((t) => !valid.includes(t));
    if (rejected.length > 0) {
      errors.push(`rejected invalid tamper names: ${rejected.join(", ")}`);
    }
    if (valid.length > 0) {
      args.push(`--tamper=${valid.join(",")}`);
    }
  }

  // --- proxy / tor ---
  if (req.proxy) {
    if (SHELL_METACHARS.test(req.proxy) || !/^[a-z0-9]+:\/\//i.test(req.proxy)) {
      errors.push("proxy must be a valid url");
    } else {
      args.push(`--proxy=${req.proxy}`);
    }
  }
  if (req.proxyFile) {
    if (SHELL_METACHARS.test(req.proxyFile)) {
      errors.push("proxyFile contains forbidden characters");
    } else {
      args.push(`--proxy-file=${req.proxyFile}`);
    }
  }
  if (req.tor) {
    args.push("--tor");
    if (req.torType === "SOCKS5" || req.torType === "HTTP") {
      args.push(`--tor-type=${req.torType}`);
    }
  }
  if (req.randomAgent) {
    args.push("--random-agent");
  }

  // --- numeric tuning ---
  if (typeof req.threads === "number") {
    args.push(`--threads=${clamp(Math.floor(req.threads), 1, 10)}`);
  }
  if (typeof req.delay === "number" && req.delay >= 0) {
    args.push(`--delay=${req.delay}`);
  }
  if (typeof req.timeout === "number" && req.timeout > 0) {
    args.push(`--timeout=${req.timeout}`);
  }
  if (typeof req.retries === "number" && req.retries >= 0) {
    args.push(`--retries=${Math.floor(req.retries)}`);
  }

  // --- dbms ---
  if (req.dbms) {
    if (!DBMS_NAME.test(req.dbms)) {
      errors.push("dbms contains invalid characters");
    } else {
      args.push(`--dbms=${req.dbms}`);
    }
  }

  // --- flags ---
  // batch defaults to true to avoid interactive prompts hanging the spawn
  if (req.batch !== false) {
    args.push("--batch");
  }
  if (req.flushSession) {
    args.push("--flush-session");
  }
  if (req.forms) {
    args.push("--forms");
  }
  if (typeof req.crawl === "number" && req.crawl > 0) {
    args.push(`--crawl=${Math.floor(req.crawl)}`);
  }

  // --- extra args ---
  if (req.extraArgs && Array.isArray(req.extraArgs)) {
    for (const a of req.extraArgs) {
      if (typeof a !== "string") {
        errors.push("extraArgs must be strings");
        continue;
      }
      if (SHELL_METACHARS.test(a)) {
        errors.push(`extraArgs entry contains forbidden shell metachar: ${a}`);
        continue;
      }
      const denied = isDeniedExtraArg(a);
      if (denied !== null) {
        errors.push(`extraArgs entry uses denied flag (${denied}): ${a}`);
        continue;
      }
      if (!SAFE_EXTRA_ARG.test(a)) {
        errors.push(`extraArgs entry contains disallowed characters: ${a}`);
        continue;
      }
      args.push(a);
    }
  }

  // Always emit machine-friendlier output.
  if (!args.includes("--disable-coloring")) {
    args.push("--disable-coloring");
  }

  return { ok: errors.length === 0, args, errors };
}
