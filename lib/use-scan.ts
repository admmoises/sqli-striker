"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SSE client hook for /api/sqlmap/scan.
 *
 * EventSource doesn't allow POST bodies, so we parse SSE manually from a
 * fetch ReadableStream. Buffers partial chunks across reads. Holds elapsed
 * time as a tick-driven derived state to avoid re-rendering parent on every
 * incoming line.
 */

export interface LogLine {
  /** Monotonic id assigned at creation. Stable across trim — use as React key. */
  id: number;
  ts: number;
  text: string;
  /** True if it came from stderr — controls coloring downstream. */
  err: boolean;
}

export type ScanStatus =
  | "idle"
  | "starting"
  | "scanning"
  | "stopping"
  | "stopped"
  | "done"
  | "error";

export interface ScanState {
  scanId: string | null;
  status: ScanStatus;
  /** Combined stream in order received. */
  lines: LogLine[];
  exitCode: number | null;
  exitSignal: string | null;
  startedAt: number | null;
  endedAt: number | null;
  elapsedMs: number;
  /** Server validation / connection error, if any. */
  error: string | null;
}

const INITIAL: ScanState = {
  scanId: null,
  status: "idle",
  lines: [],
  exitCode: null,
  exitSignal: null,
  startedAt: null,
  endedAt: null,
  elapsedMs: 0,
  error: null,
};

const MAX_LINES = 5000;

/**
 * Per-chunk SSE parser. Tracks a leftover buffer between calls. Emits
 * (event, data) pairs in order.
 */
function makeSseParser(): (chunk: string) => Array<{ event: string; data: string }> {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    const events: Array<{ event: string; data: string }> = [];
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) {
        events.push({ event, data: dataLines.join("\n") });
      }
    }
    return events;
  };
}

export interface UseScanReturn {
  state: ScanState;
  start: (payload: unknown) => Promise<void>;
  stop: () => Promise<void>;
  clear: () => void;
}

export function useScan(): UseScanReturn {
  const [state, setState] = useState<ScanState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;

  const abortRef = useRef<AbortController | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Monotonic counter for stable React keys, immune to MAX_LINES trim.
  const lineIdRef = useRef(0);

  // Elapsed time ticker — only updates the elapsedMs slice, not the whole
  // state, while scanning. Drives the on-screen mm:ss display.
  useEffect(() => {
    const status = state.status;
    const isLive = status === "scanning" || status === "starting" || status === "stopping";
    if (isLive && state.startedAt) {
      if (tickRef.current === null) {
        tickRef.current = setInterval(() => {
          setState((s) => {
            if (!s.startedAt) return s;
            const live =
              s.status === "scanning" || s.status === "starting" || s.status === "stopping";
            if (!live) return s;
            return { ...s, elapsedMs: Date.now() - s.startedAt };
          });
        }, 200);
      }
    } else if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => {
      if (tickRef.current !== null) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [state.status, state.startedAt]);

  // Preserves scan identity (scanId, startedAt, status, etc.) when called
  // mid-scan; only zeroes the visible log buffer + error/exit fields. Use
  // this for the "clear console" UX action so the live scan keeps reporting.
  const clear = useCallback(() => {
    setState((s) => ({
      ...s,
      lines: [],
      error: null,
      exitCode: null,
      exitSignal: null,
    }));
  }, []);

  const stop = useCallback(async () => {
    const id = stateRef.current.scanId;
    setState((s) => ({ ...s, status: "stopping" }));
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore — abort signal may already be detached
      }
    }
    if (!id) return;
    try {
      await fetch("/api/sqlmap/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: id }),
      });
    } catch {
      // server may have already reaped the process
    }
  }, []);

  const start = useCallback(async (payload: unknown) => {
    // Reset and prepare a fresh AbortController for this run.
    if (abortRef.current) {
      try {
        abortRef.current.abort();
      } catch {
        // ignore
      }
    }
    const ac = new AbortController();
    abortRef.current = ac;

    setState({
      ...INITIAL,
      status: "starting",
      startedAt: Date.now(),
    });

    let res: Response;
    try {
      res = await fetch("/api/sqlmap/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setState((s) => ({ ...s, status: "error", error: msg }));
      return;
    }

    if (!res.ok || !res.body) {
      let detail: string | null = null;
      try {
        const j = (await res.json()) as { error?: string; details?: unknown };
        detail = j.error ?? null;
        if (Array.isArray(j.details)) detail = `${detail ?? ""}: ${j.details.join("; ")}`;
      } catch {
        // body not JSON
      }
      setState((s) => ({
        ...s,
        status: "error",
        error: detail ?? `HTTP ${res.status}`,
      }));
      return;
    }

    setState((s) => ({ ...s, status: "scanning" }));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = makeSseParser();

    // Buffer pending lines and flush in batches to avoid re-rendering on
    // every single SSE event when sqlmap is firing dozens per second.
    let pending: LogLine[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = (): void => {
      if (pending.length === 0) return;
      const batch = pending;
      pending = [];
      setState((s) => {
        const merged = s.lines.concat(batch);
        const trimmed = merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
        return { ...s, lines: trimmed };
      });
    };
    const scheduleFlush = (): void => {
      if (flushTimer !== null) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
      }, 60);
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const events = parse(text);
        for (const ev of events) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(ev.data);
          } catch {
            continue;
          }
          if (ev.event === "meta") {
            const m = parsed as { scanId?: string; startedAt?: number };
            if (m.scanId) {
              setState((s) => ({
                ...s,
                scanId: m.scanId ?? null,
                startedAt: m.startedAt ?? s.startedAt,
              }));
            }
          } else if (ev.event === "stdout" || ev.event === "stderr") {
            const p = parsed as { line?: string; timestamp?: number };
            lineIdRef.current += 1;
            pending.push({
              id: lineIdRef.current,
              ts: p.timestamp ?? Date.now(),
              text: p.line ?? "",
              err: ev.event === "stderr",
            });
            scheduleFlush();
          } else if (ev.event === "exit") {
            flush();
            const p = parsed as { code?: number | null; signal?: string | null };
            const code = typeof p.code === "number" ? p.code : null;
            const signal = typeof p.signal === "string" ? p.signal : null;
            setState((s) => ({
              ...s,
              status: code === 0 ? "done" : signal !== null ? "stopped" : "error",
              exitCode: code,
              exitSignal: signal,
              endedAt: Date.now(),
              elapsedMs: s.startedAt ? Date.now() - s.startedAt : s.elapsedMs,
            }));
          }
        }
      }
    } catch (e) {
      // Aborted from the client is expected when user hits stop.
      if (!ac.signal.aborted) {
        const msg = e instanceof Error ? e.message : String(e);
        setState((s) => ({ ...s, status: "error", error: msg }));
      }
    } finally {
      if (flushTimer !== null) clearTimeout(flushTimer);
      flush();
      setState((s) =>
        s.status === "starting" || s.status === "scanning" || s.status === "stopping"
          ? { ...s, status: ac.signal.aborted ? "stopped" : "done", endedAt: Date.now() }
          : s,
      );
    }
  }, []);

  return { state, start, stop, clear };
}
