/**
 * IP range expander — converts CIDR notation and dash ranges to arrays of IPs.
 */

/** Convert an IPv4 address string to a 32-bit integer */
function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IP: ${ip}`);
  }
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Convert a 32-bit integer back to an IPv4 string */
function intToIp(n: number): string {
  return [
    (n >>> 24) & 255,
    (n >>> 16) & 255,
    (n >>> 8) & 255,
    n & 255,
  ].join(".");
}

/**
 * Parse a CIDR range (e.g. "192.168.1.0/24") and return all IPs.
 * Capped at /16 (65536 IPs) to prevent abuse.
 */
function expandCidr(cidr: string): string[] {
  const [base, bitsStr] = cidr.split("/");
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 8 || bits > 32) {
    throw new Error(`Invalid CIDR: /${bitsStr}`);
  }
  if (bits < 16) {
    throw new Error("CIDR ranges smaller than /16 are too large (max 65536 IPs)");
  }
  const baseInt = ipToInt(base);
  const mask = ~((1 << (32 - bits)) - 1);
  const network = baseInt & mask;
  const count = 1 << (32 - bits);
  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    ips.push(intToIp((network + i) >>> 0));
  }
  return ips;
}

/**
 * Parse a dash range (e.g. "192.168.1.1-192.168.1.254").
 */
function expandDashRange(range: string): string[] {
  const [start, end] = range.split("-").map((s) => s.trim());
  if (!start || !end) throw new Error(`Invalid range: ${range}`);
  const startInt = ipToInt(start);
  const endInt = ipToInt(end);
  if (endInt < startInt) throw new Error(`End IP must be >= start IP: ${range}`);
  const count = endInt - startInt + 1;
  if (count > 65536) throw new Error("Range too large (max 65536 IPs)");
  const ips: string[] = [];
  for (let i = 0; i < count; i++) {
    ips.push(intToIp((startInt + i) >>> 0));
  }
  return ips;
}

/**
 * Parse a single IP or hostname — returns as-is.
 */
function parseSingle(target: string): string[] {
  // Validate looks like an IP or hostname
  if (/^[a-zA-Z0-9._-]+$/.test(target) || /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
    return [target];
  }
  throw new Error(`Invalid target format: ${target}`);
}

/**
 * Expand target strings into individual IPs/hosts.
 * Accepts: single IP/host, CIDR (192.168.1.0/24), dash range (10.0.0.1-10.0.0.50).
 */
export function expandTargets(input: string): string[] {
  const targets = input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const all: string[] = [];

  for (const target of targets) {
    if (target.includes("/")) {
      all.push(...expandCidr(target));
    } else if (target.includes("-") && target.split("-").length === 2) {
      all.push(...expandDashRange(target));
    } else {
      all.push(...parseSingle(target));
    }
  }

  return [...new Set(all)]; // deduplicate
}

/**
 * Expand ports from a string like "80,443,8080-8085".
 */
export function expandPorts(input: string): number[] {
  const parts = input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const ports: number[] = [];

  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      if (isNaN(start) || isNaN(end) || start < 1 || end > 65535 || start > end) {
        throw new Error(`Invalid port range: ${part}`);
      }
      for (let p = start; p <= end; p++) {
        ports.push(p);
      }
    } else {
      const p = parseInt(part, 10);
      if (isNaN(p) || p < 1 || p > 65535) {
        throw new Error(`Invalid port: ${part}`);
      }
      ports.push(p);
    }
  }

  return [...new Set(ports)].sort((a, b) => a - b);
}
