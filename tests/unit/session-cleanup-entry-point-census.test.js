/**
 * SD-LEO-INFRA-STALE-SWEEP-LIVENESS-SSOT-001 (FR-4/FR-5d): the cross-seat
 * cleanupStaleSessions() walk must be reachable from exactly ONE entry point (the scheduled
 * sweep) -- every OTHER caller can release a sibling session's claim off a stale local file
 * that has nothing to do with the caller's own routine command (npm run sd:next, a status
 * check). This is a static census, not a runtime test: it greps the tree for call sites so a
 * new caller added later is caught here rather than discovered live.
 *
 * BASELINE (measured pre-fix, 2026-09-04): scripts/claude-session-coordinator.mjs:260 (status)
 * and :324 (cleanup), scripts/modules/sd-next/SDNextSelector.js:322 -- three call sites.
 * ALLOWED after this SD: only scripts/claude-session-coordinator.mjs's `cleanup()` command.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');

// Files allowed to call cleanupStaleSessions with cross-seat scope. lib/session-manager.mjs
// itself (the definition + its own JSDoc/comments) is excluded from the grep on purpose.
const ALLOWED_CALLERS = new Set(['scripts/claude-session-coordinator.mjs']);

function grepCallSites() {
  let raw;
  try {
    raw = execFileSync('git', ['grep', '-n', '--', 'cleanupStaleSessions('], { cwd: REPO_ROOT, encoding: 'utf-8' });
  } catch (err) {
    // git grep exits 1 when there are zero matches -- treat that as "no call sites" rather
    // than a test-harness failure.
    if (err.status === 1) return [];
    throw err;
  }
  return [...new Set(
    raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':');
        return line.slice(0, idx).replace(/\\/g, '/');
      })
  )].filter((file) =>
    /\.(js|mjs|cjs|ts|tsx)$/.test(file)
    && file !== 'lib/session-manager.mjs'
    && !file.startsWith('tests/')
    && !file.startsWith('scripts/archive/')
    && !file.startsWith('scripts/one-off/')
  );
}

describe('cleanupStaleSessions entry-point census (FR-4/FR-5d)', () => {
  it('is called ONLY from the scheduled sweep entry point, never sd:next or status', () => {
    const callers = grepCallSites();
    const unexpected = callers.filter((f) => !ALLOWED_CALLERS.has(f));
    expect(unexpected, `Unexpected cleanupStaleSessions() caller(s): ${unexpected.join(', ')}`).toEqual([]);
  });
});
