"use client";

import { useState, useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaVisualProps {
  databases: string[];
  tables: Record<string, string[]>;
  columns: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const DB_WIDTH = 300;
const DB_HEADER_H = 28;
const DB_PAD = 10;
const TABLE_WIDTH = 274;
const TABLE_HEADER_H = 22;
const TABLE_PAD = 6;
const COL_H = 16;
const TABLE_GAP = 6;
const DB_GAP_X = 16;
const DB_GAP_Y = 16;
const GRID_COLS = 3;
const TITLE_FS = 12;
const COL_FS = 10;
const MIN_DB_H = 72;

const GLOW_FILTER = "drop-shadow(0 0 8px rgba(255,23,68,0.3))";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

// ---------------------------------------------------------------------------
// Layout engine (pure — returns positions for every visible element)
// ---------------------------------------------------------------------------

interface TableLayout {
  table: string;
  cols: string[];
  h: number;
}

interface TablePosition {
  table: string;
  x: number;
  y: number;
  width: number;
  height: number;
  cols: string[];
}

interface DbPosition {
  db: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tablePositions: TablePosition[];
  isEmpty: boolean;
}

interface Layout {
  dbPositions: DbPosition[];
  svgWidth: number;
  svgHeight: number;
}

function computeLayout(
  databases: string[],
  tables: Record<string, string[]>,
  columns: Record<string, string[]>,
  selectedDb: string | null,
  selectedTable: string | null,
): Layout {
  if (databases.length === 0) {
    return { dbPositions: [], svgWidth: 400, svgHeight: 100 };
  }

  // ---- first pass: measure every DB box ----

  const items = databases.map((db) => {
    const isExpanded = selectedDb === db;
    const dbTables = isExpanded ? (tables[db] ?? []) : [];

    const tableLayouts: TableLayout[] = dbTables.map((tbl) => {
      const key = `${db}.${tbl}`;
      const isTableExpanded = selectedTable === key;
      const tblCols = isTableExpanded ? (columns[key] ?? []) : [];
      const h = TABLE_HEADER_H + tblCols.length * COL_H + 2 * TABLE_PAD;
      return { table: tbl, cols: tblCols, h };
    });

    const totalTH = tableLayouts.reduce((s, t) => s + t.h, 0);
    const gapsH = Math.max(0, dbTables.length - 1) * TABLE_GAP;
    const contentH =
      dbTables.length > 0
        ? TABLE_GAP + totalTH + gapsH + TABLE_GAP
        : isExpanded
          ? 20
          : 0;
    const dbH = Math.max(MIN_DB_H, DB_HEADER_H + contentH + 2 * DB_PAD);

    return {
      db,
      dbH,
      tableLayouts,
      isEmpty: isExpanded && dbTables.length === 0,
    };
  });

  // ---- row heights ----

  const rowHeights: number[] = [];
  items.forEach((it, idx) => {
    const row = Math.floor(idx / GRID_COLS);
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, it.dbH);
  });

  // ---- row Y starts ----

  let cumY = 10;
  const rowStarts: number[] = rowHeights.map((h) => {
    const y = cumY;
    cumY += h + DB_GAP_Y;
    return y;
  });

  // ---- build final positions ----

  let maxBottom = 0;
  const dbPositions: DbPosition[] = items.map((it, idx) => {
    const col = idx % GRID_COLS;
    const row = Math.floor(idx / GRID_COLS);
    const dbX = col * (DB_WIDTH + DB_GAP_X) + 10;
    const dbY = rowStarts[row];

    let curY = DB_HEADER_H + DB_PAD + TABLE_GAP;
    const tablePositions: TablePosition[] = it.tableLayouts.map((tl) => {
      const tx = (DB_WIDTH - TABLE_WIDTH) / 2;
      const ty = curY;
      curY += tl.h + TABLE_GAP;
      return {
        table: tl.table,
        x: tx,
        y: ty,
        width: TABLE_WIDTH,
        height: tl.h,
        cols: tl.cols,
      };
    });

    const bottom = dbY + it.dbH;
    if (bottom > maxBottom) maxBottom = bottom;

    return {
      db: it.db,
      x: dbX,
      y: dbY,
      width: DB_WIDTH,
      height: it.dbH,
      tablePositions,
      isEmpty: it.isEmpty,
    };
  });

  const visibleCols = Math.min(GRID_COLS, databases.length);
  const svgWidth = visibleCols * (DB_WIDTH + DB_GAP_X) + 10;
  const svgHeight = maxBottom + 10;

  return { dbPositions, svgWidth, svgHeight };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SchemaVisual({
  databases,
  tables,
  columns,
}: SchemaVisualProps): React.ReactElement {
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

  const layout = useMemo(
    () => computeLayout(databases, tables, columns, selectedDb, selectedTable),
    [databases, tables, columns, selectedDb, selectedTable],
  );

  // ---- handlers ----

  const handleDbClick = (db: string) => {
    setSelectedDb((prev) => (prev === db ? null : db));
    setSelectedTable(null);
  };

  const handleTableClick = (tableKey: string) => {
    setSelectedTable((prev) => (prev === tableKey ? null : tableKey));
  };

  // ---- empty state ----

  if (databases.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] bg-void/80 border border-blood-deep/40 p-6">
        <span className="text-bone-dim font-mono text-sm tracking-wide">
          No schema data — run enumeration first
        </span>
      </div>
    );
  }

  // ---- render ----

  return (
    <div className="max-h-[70vh] overflow-auto bg-void/80 border border-blood-deep/40">
      <svg
        viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
        width={layout.svgWidth}
        height={layout.svgHeight}
        className="block min-w-full"
      >
        {layout.dbPositions.map((dp) => {
          const isDbSel = selectedDb === dp.db;
          const hasTables = (tables[dp.db]?.length ?? 0) > 0;

          return (
            <g key={dp.db}>
              {/* ---- DB box ---- */}
              <rect
                x={dp.x}
                y={dp.y}
                width={dp.width}
                height={dp.height}
                rx={3}
                fill="rgba(0,0,0,0.6)"
                stroke={
                  isDbSel ? "var(--blood-neon)" : "rgba(255,0,51,0.45)"
                }
                strokeWidth={isDbSel ? 1.5 : 1}
                style={isDbSel ? { filter: GLOW_FILTER } : undefined}
                onClick={() => handleDbClick(dp.db)}
                className="cursor-pointer"
              />

              {/* ---- DB header bar ---- */}
              <rect
                x={dp.x}
                y={dp.y}
                width={dp.width}
                height={DB_HEADER_H}
                rx={3}
                fill="rgba(255,0,51,0.1)"
                onClick={() => handleDbClick(dp.db)}
                className="cursor-pointer"
              />

              {/* ---- DB name ---- */}
              <text
                x={dp.x + 10}
                y={dp.y + DB_HEADER_H - 9}
                fill="var(--blood)"
                fontSize={TITLE_FS}
                fontFamily="var(--font-mono), monospace"
                fontWeight="bold"
                className="select-none pointer-events-none"
              >
                {"\u25B8"} {trunc(dp.db, 30)}
              </text>

              {/* ---- Tables ---- */}
              {dp.tablePositions.map((tp) => {
                const tableKey = `${dp.db}.${tp.table}`;
                const isTblSel = selectedTable === tableKey;

                return (
                  <g key={tableKey}>
                    {/* Table box */}
                    <rect
                      x={dp.x + tp.x}
                      y={dp.y + tp.y}
                      width={tp.width}
                      height={tp.height}
                      rx={2}
                      fill="rgba(10,0,0,0.4)"
                      stroke={
                        isTblSel
                          ? "var(--blood-neon)"
                          : "rgba(139,0,0,0.4)"
                      }
                      strokeWidth={isTblSel ? 1.5 : 1}
                      style={isTblSel ? { filter: GLOW_FILTER } : undefined}
                      onClick={() => handleTableClick(tableKey)}
                      className="cursor-pointer"
                    />

                    {/* Table header bar */}
                    <rect
                      x={dp.x + tp.x}
                      y={dp.y + tp.y}
                      width={tp.width}
                      height={TABLE_HEADER_H}
                      rx={2}
                      fill="rgba(139,0,0,0.2)"
                      onClick={() => handleTableClick(tableKey)}
                      className="cursor-pointer"
                    />

                    {/* Table name */}
                    <text
                      x={dp.x + tp.x + 8}
                      y={dp.y + tp.y + TABLE_HEADER_H - 7}
                      fill="var(--blood-neon)"
                      fontSize={TITLE_FS}
                      fontFamily="var(--font-mono), monospace"
                      className="select-none pointer-events-none"
                    >
                      {trunc(tp.table, 36)}
                    </text>

                    {/* Column items */}
                    {tp.cols.map((col, ci) => (
                      <text
                        key={col}
                        x={dp.x + tp.x + 12}
                        y={
                          dp.y +
                          tp.y +
                          TABLE_HEADER_H +
                          TABLE_PAD +
                          ci * COL_H +
                          11
                        }
                        fill="var(--bone-dim)"
                        fontSize={COL_FS}
                        fontFamily="var(--font-mono), monospace"
                        className="select-none pointer-events-none"
                      >
                        {trunc(col, 36)}
                      </text>
                    ))}
                  </g>
                );
              })}

              {/* ---- Empty DB message ---- */}
              {dp.isEmpty && (
                <text
                  x={dp.x + dp.width / 2}
                  y={dp.y + DB_HEADER_H + DB_PAD + 16}
                  textAnchor="middle"
                  fill="var(--ash-dim)"
                  fontSize={10}
                  fontFamily="var(--font-mono), monospace"
                  className="select-none"
                >
                  no tables found
                </text>
              )}

              {/* ---- Click-to-expand hint ---- */}
              {!isDbSel && hasTables && (
                <text
                  x={dp.x + dp.width / 2}
                  y={dp.y + dp.height / 2 + 4}
                  textAnchor="middle"
                  fill="var(--ash-dim)"
                  fontSize={10}
                  fontFamily="var(--font-mono), monospace"
                  className="select-none pointer-events-none"
                >
                  click to expand
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
