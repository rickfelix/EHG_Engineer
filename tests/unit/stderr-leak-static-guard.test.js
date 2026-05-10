/**
 * Static guard test for PAT-EXEC-SYNC-STDERR-LEAK-IN-CATCH-001.
 * QF-20260509-699 — sibling-sites batch follow-up to QF-20260509-442 (PR #3656).
 *
 * Scans the 3 files known to call execSync('git ...') inside silent try/catch
 * blocks and asserts every execSync invocation passes stdio:'pipe' (or array
 * form with stderr piped/ignored). Without this guard, a future edit can
 * silently re-introduce the stderr leak — the JS catch keeps the pipeline
 * green but the user sees `fatal:` on stderr.
 *
 * Pinned files (must keep stdio:'pipe' on every execSync call):
 *   - lib/multi-repo/index.js
 *   - lib/agents/context-monitor.js
 *   - lib/context/unified-state-manager.js
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');

const PINNED_FILES = [
  'lib/multi-repo/index.js',
  'lib/agents/context-monitor.js',
  'lib/context/unified-state-manager.js',
];

// Match an execSync call and capture its full argument-object literal.
// Greedy enough to span multi-line option blocks; relies on balanced braces
// being uncommon inside the options object (no nested object literals exist
// in the pinned files).
const EXEC_SYNC_CALL_RE = /execSync\s*\([^)]*?\{([^{}]*?)\}\s*\)/gms;

function findExecSyncCalls(source) {
  const matches = [];
  let m;
  EXEC_SYNC_CALL_RE.lastIndex = 0;
  while ((m = EXEC_SYNC_CALL_RE.exec(source)) !== null) {
    matches.push({
      full: m[0],
      optionsBody: m[1],
      lineNumber: source.slice(0, m.index).split('\n').length,
    });
  }
  return matches;
}

function hasStdioPipe(optionsBody) {
  // Accepts: stdio: 'pipe' | "pipe" | [..., 'pipe'|'ignore', ...]
  return /stdio\s*:\s*(['"]pipe['"]|\[[^\]]*\])/.test(optionsBody);
}

describe('PAT-EXEC-SYNC-STDERR-LEAK-IN-CATCH-001 — static guard', () => {
  for (const relPath of PINNED_FILES) {
    it(`every execSync in ${relPath} sets stdio:'pipe'`, () => {
      const source = readFileSync(join(repoRoot, relPath), 'utf8');
      const calls = findExecSyncCalls(source);
      expect(calls.length, `expected at least one execSync call in ${relPath}`).toBeGreaterThan(0);

      const offenders = calls.filter((c) => !hasStdioPipe(c.optionsBody));
      const offenderLines = offenders.map((c) => `  line ${c.lineNumber}: ${c.full.slice(0, 120).replace(/\s+/g, ' ')}…`).join('\n');
      expect(
        offenders.length,
        `${offenders.length} execSync call(s) in ${relPath} missing stdio:'pipe' — see PAT-EXEC-SYNC-STDERR-LEAK-IN-CATCH-001:\n${offenderLines}`,
      ).toBe(0);
    });
  }
});
