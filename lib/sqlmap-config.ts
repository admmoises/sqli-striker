/**
 * Centralised configuration for sqlmap binary and tamper directory.
 * Both are overridable via environment variables.
 */

export const SQLMAP_BIN: string =
  process.env.SQLMAP_BIN ?? "/opt/homebrew/bin/sqlmap";

export const SQLMAP_TAMPER_DIR: string =
  process.env.SQLMAP_TAMPER_DIR ??
  "/opt/homebrew/Cellar/sqlmap/1.10.3/libexec/tamper";
