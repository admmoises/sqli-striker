/**
 * Singleton store for active sqlmap child processes.
 * Shared across API route handlers so /scan and /stop see the same map.
 *
 * NOTE: lives on globalThis to survive Next.js dev-mode HMR reloads — without
 * this, each module reload would orphan running processes.
 */

import type { ChildProcess } from "node:child_process";

export interface ActiveScan {
  id: string;
  process: ChildProcess;
  startedAt: number;
  target: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __sqlmapActiveScans: Map<string, ActiveScan> | undefined;
}

export const activeScans: Map<string, ActiveScan> =
  globalThis.__sqlmapActiveScans ?? new Map<string, ActiveScan>();

if (!globalThis.__sqlmapActiveScans) {
  globalThis.__sqlmapActiveScans = activeScans;
}

export function registerScan(scan: ActiveScan): void {
  activeScans.set(scan.id, scan);
}

export function getScan(id: string): ActiveScan | undefined {
  return activeScans.get(id);
}

export function removeScan(id: string): void {
  activeScans.delete(id);
}

export function listScans(): ActiveScan[] {
  return Array.from(activeScans.values());
}
