/**
 * Heuristic parser for sqlmap stdout. Watches text-form lines coming through
 * the SSE stream and tries to surface fingerprints, databases, tables, columns
 * and dump counts. This is intentionally best-effort: sqlmap output isn't a
 * stable contract, so when in doubt we leave the field empty rather than
 * guess.
 */

export interface ParsedResults {
  dbms: string | null;
  webServer: string | null;
  webTech: string[];
  os: string | null;
  injectionPoints: string[];
  databases: string[];
  /** Map of db -> tables */
  tables: Record<string, string[]>;
  /** Map of "db.table" -> columns */
  columns: Record<string, string[]>;
  dumpedRows: number;
  currentStatus: string | null;
}

export function emptyResults(): ParsedResults {
  return {
    dbms: null,
    webServer: null,
    webTech: [],
    os: null,
    injectionPoints: [],
    databases: [],
    tables: {},
    columns: {},
    dumpedRows: 0,
    currentStatus: null,
  };
}

const ANSI_RE = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g;

/**
 * Parse a list of stdout lines (already-stripped of timestamps) into a
 * fresh ParsedResults snapshot. Pure — safe to memoize on the line array.
 */
export function parseResults(lines: readonly string[]): ParsedResults {
  const r = emptyResults();

  // Track "Database: X" → next "Table: Y" pairing for column listings.
  let currentDb: string | null = null;
  let currentTable: string | null = null;
  let inColumnsTable = false;

  for (const raw of lines) {
    const line = raw.replace(ANSI_RE, "");

    // status / progress
    if (/\[INFO\]\s+testing\s+connection/i.test(line)) {
      r.currentStatus = "testing connection";
    } else if (/\[INFO\]\s+heuristic/i.test(line)) {
      r.currentStatus = "heuristic detection";
    } else if (/\[INFO\]\s+testing/i.test(line)) {
      const m = line.match(/\[INFO\]\s+testing\s+(.+)$/i);
      if (m) r.currentStatus = m[1].trim();
    } else if (/\[INFO\]\s+fetching/i.test(line)) {
      const m = line.match(/\[INFO\]\s+fetching\s+(.+)$/i);
      if (m) r.currentStatus = m[1].trim();
    }

    // DBMS fingerprint
    let m: RegExpMatchArray | null;
    if ((m = line.match(/back-end DBMS:\s+(.+?)(?:\r|$)/i))) {
      r.dbms = m[1].trim();
    } else if ((m = line.match(/\[INFO\]\s+the back-end DBMS is\s+(.+)$/i))) {
      r.dbms = r.dbms ?? m[1].trim().replace(/\.$/, "");
    }

    // web server / tech / OS
    if ((m = line.match(/web server operating system:\s+(.+?)(?:\r|$)/i))) {
      r.os = m[1].trim();
    }
    if ((m = line.match(/web application technology:\s+(.+?)(?:\r|$)/i))) {
      r.webTech = m[1]
        .split(/,\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if ((m = line.match(/^web server:\s+(.+?)(?:\r|$)/i))) {
      r.webServer = m[1].trim();
    }

    // Injection: Parameter / Type / Title patterns
    if ((m = line.match(/Parameter:\s+(.+?)(?:\r|$)/i))) {
      const v = `param ${m[1].trim()}`;
      if (!r.injectionPoints.includes(v)) r.injectionPoints.push(v);
    }

    // available databases [N]:
    if (/available databases\s*\[\d+\]:/i.test(line)) {
      // Following lines like `[*] dbname` collect until blank line — handled below.
      continue;
    }
    // Note: `[*] name` lines (db / table list entries) are picked up in the
    // second pass below, where we know we've just seen "available databases".

    // Database / Table headers
    if ((m = line.match(/^Database:\s+(.+?)(?:\r|$)/i))) {
      currentDb = m[1].trim();
      if (!r.databases.includes(currentDb)) r.databases.push(currentDb);
      currentTable = null;
      inColumnsTable = false;
      continue;
    }
    if ((m = line.match(/^Table:\s+(.+?)(?:\r|$)/i))) {
      currentTable = m[1].trim();
      if (currentDb) {
        const arr = r.tables[currentDb] ?? [];
        if (!arr.includes(currentTable)) arr.push(currentTable);
        r.tables[currentDb] = arr;
      }
      inColumnsTable = false;
      continue;
    }
    // Column listing header pattern: "| Column | Type |"
    if (/^\|\s*Column\s*\|\s*Type\s*\|/i.test(line)) {
      inColumnsTable = true;
      continue;
    }
    if (inColumnsTable && currentDb && currentTable) {
      // | name | type | rows
      const colMatch = line.match(/^\|\s*([A-Za-z0-9_]+)\s*\|/);
      if (colMatch) {
        const key = `${currentDb}.${currentTable}`;
        const arr = r.columns[key] ?? [];
        if (!arr.includes(colMatch[1])) arr.push(colMatch[1]);
        r.columns[key] = arr;
      } else if (line.startsWith("+") || line.trim() === "") {
        // table delimiter line - end column section on blank
        if (line.trim() === "") inColumnsTable = false;
      }
    }

    // Rows fetched / dumped counter
    if ((m = line.match(/(\d+)\s+entries\b/i))) {
      const n = Number(m[1]);
      if (Number.isFinite(n)) r.dumpedRows = Math.max(r.dumpedRows, n);
    }
  }

  // Second pass for "available databases [N]:" → following `[*]` lines.
  let collectingDbs = false;
  for (const raw of lines) {
    const line = raw.replace(ANSI_RE, "");
    if (/available databases\s*\[\d+\]:/i.test(line)) {
      collectingDbs = true;
      continue;
    }
    if (collectingDbs) {
      const m = line.match(/^\[\*\]\s+(\S+)\s*$/);
      if (m) {
        if (!r.databases.includes(m[1])) r.databases.push(m[1]);
      } else if (line.trim() === "") {
        collectingDbs = false;
      }
    }
  }

  return r;
}
