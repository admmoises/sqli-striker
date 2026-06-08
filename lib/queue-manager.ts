/**
 * Multi-target scan queue manager.
 *
 * Accepts batches of targets, executes them with configurable concurrency,
 * tracks per-target status, and supports scheduling + auto-retry.
 *
 * Lives on globalThis like scan-manager to survive HMR.
 */

export type QueueItemStatus =
  | "queued"
  | "running"
  | "done"
  | "failed"
  | "aborted"
  | "rate_limited";

export interface QueueItem {
  id: string;
  target: string;
  config: Record<string, unknown>;
  status: QueueItemStatus;
  scanId: string | null;
  startedAt: number | null;
  endedAt: number | null;
  error: string | null;
  retries: number;
  resultSummary: string | null;
  scheduledAt: number | null;
  position: number;
}

export interface QueueState {
  items: QueueItem[];
  maxConcurrency: number;
  activeCount: number;
  paused: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __sqliQueueState: QueueState | undefined;
  // eslint-disable-next-line no-var
  var __sqliQueuePosition: number | undefined;
}

const DEFAULT_MAX_CONCURRENCY = 3;

export const queueState: QueueState =
  globalThis.__sqliQueueState ?? {
    items: [],
    maxConcurrency: DEFAULT_MAX_CONCURRENCY,
    activeCount: 0,
    paused: false,
  };

if (!globalThis.__sqliQueueState) {
  globalThis.__sqliQueueState = queueState;
}

if (globalThis.__sqliQueuePosition === undefined) {
  globalThis.__sqliQueuePosition = 0;
}

function nextPosition(): number {
  return globalThis.__sqliQueuePosition!++;
}

export function addToQueue(
  target: string,
  config: Record<string, unknown>,
  scheduledAt: number | null = null,
): QueueItem {
  const item: QueueItem = {
    id: crypto.randomUUID(),
    target,
    config,
    status: "queued",
    scanId: null,
    startedAt: null,
    endedAt: null,
    error: null,
    retries: 0,
    resultSummary: null,
    scheduledAt,
    position: nextPosition(),
  };
  queueState.items.push(item);
  return item;
}

export function addBatch(
  targets: string[],
  config: Record<string, unknown>,
): QueueItem[] {
  return targets.map((t) => addToQueue(t, config));
}

export function getQueue(): QueueItem[] {
  return [...queueState.items].sort((a, b) => a.position - b.position);
}

export function getItem(id: string): QueueItem | undefined {
  return queueState.items.find((i) => i.id === id);
}

export function updateItem(
  id: string,
  patch: Partial<QueueItem>,
): QueueItem | undefined {
  const item = queueState.items.find((i) => i.id === id);
  if (!item) return undefined;
  Object.assign(item, patch);
  return item;
}

export function removeItem(id: string): boolean {
  const idx = queueState.items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  queueState.items.splice(idx, 1);
  return true;
}

export function clearQueue(): void {
  queueState.items = [];
  globalThis.__sqliQueuePosition = 0;
}

export function getNextQueued(): QueueItem | undefined {
  const now = Date.now();
  return queueState.items.find(
    (i) =>
      i.status === "queued" &&
      (i.scheduledAt === null || i.scheduledAt <= now),
  );
}

export function canRunMore(): boolean {
  return queueState.activeCount < queueState.maxConcurrency && !queueState.paused;
}

export function setConcurrency(n: number): void {
  queueState.maxConcurrency = Math.max(1, Math.min(n, 10));
}

export function setPaused(paused: boolean): void {
  queueState.paused = paused;
}

export function getStats() {
  const items = queueState.items;
  return {
    total: items.length,
    queued: items.filter((i) => i.status === "queued").length,
    running: items.filter((i) => i.status === "running").length,
    done: items.filter((i) => i.status === "done").length,
    failed: items.filter((i) => i.status === "failed").length,
    activeCount: queueState.activeCount,
    maxConcurrency: queueState.maxConcurrency,
    paused: queueState.paused,
  };
}
