/**
 * Append-only JSONL audit logger for --auto-safe applied actions.
 *
 * Failure to write does not block the underlying cleanup action; the
 * warning surfaces on stderr so orchestration can still complete.
 */

import fs from 'fs';
import path from 'path';

export const DEFAULT_AUDIT_LOG_PATH = '.claude/cleanup-audit-log.jsonl';

export function appendAuditEntry(entry, options = {}) {
  const repoRoot = options.repoRoot || process.cwd();
  const relativePath = options.logPath || DEFAULT_AUDIT_LOG_PATH;
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(repoRoot, relativePath);

  const record = {
    timestamp: new Date().toISOString(),
    ...entry
  };

  try {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.appendFileSync(fullPath, JSON.stringify(record) + '\n');
    return { ok: true, path: fullPath };
  } catch (err) {
    console.warn(`⚠️  cleanup-audit-log: failed to write ${fullPath}: ${err.message}`);
    return { ok: false, error: err.message };
  }
}
