/**
 * Regression guard: no raw claude_sessions writes outside lib/session-writer.cjs
 * and a short, documented allow-list of exceptions.
 *
 * Part of SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001. Prevents future writers
 * from silently re-introducing the NULL-current_branch bug by bypassing
 * the shared helper. If you see this test fail, route your write through
 * `stampBranch()` from lib/session-writer.cjs instead of calling
 * `.from('claude_sessions').update(...)` or PATCH /claude_sessions directly.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

// Files allowed to write to claude_sessions without routing through stampBranch.
// Fall into three legitimate categories per SD-LEO-INFRA-SESSION-CURRENT-BRANCH-001:
//
//   A. The helper itself + the reference implementation that already resolves branch.
//   B. Writes where current_branch is not applicable: claim/release/status-only
//      transitions, metadata-only patches, telemetry counters, virtual sessions
//      without a cwd. These writes intentionally do not touch current_branch.
//   C. Archived / one-time scripts kept for audit but not run interactively.
//
// If you add a NEW file to this list, document which category and why. If your new
// code path DOES perform heartbeat-style persistence and the process is inside a
// git working tree, route through `stampBranch()` instead of extending the list.
const ALLOWLIST = new Set([
  // Category A — helper + already-branch-aware
  'lib/session-writer.cjs',
  'lib/session-manager.mjs',

  // Category B — virtual sessions (no git cwd, NULL is legitimate per PRD)
  'lib/virtual-session-factory.mjs',

  // Category B — routing / session-identity lookups that read+touch metadata
  'lib/eva/bridge/venture-session-routing.js',
  'lib/eva/venture-context-manager.js',
  'lib/resolve-own-session.js',
  'scripts/resolve-sd-workdir.js',

  // Category B — claim / release / status-only transitions (branch not relevant
  // to the state being changed; heartbeat writers handle branch separately)
  'scripts/sd-start.js',
  'scripts/assign-fleet-identities.cjs',
  'scripts/leo-continuous.js',
  'scripts/stale-session-sweep.cjs',
  'scripts/modules/handoff/auto-proceed-state.js',
  'scripts/modules/handoff/claim-swapper.js',
  'scripts/modules/handoff/continuation-state.js',
  'scripts/modules/handoff/executors/BaseExecutor.js',
  'scripts/modules/handoff/gates/multi-session-claim-gate.js',
  'scripts/modules/handoff/recording/HandoffRecorder.js',
  'scripts/modules/sd-next/claim-analysis.js',

  // Category C — archived / one-time
  'scripts/archive/one-time/stale-session-sweep.cjs',

  // Category B — release/status writes (branch not relevant to state transition)
  'lib/commands/claim-command.js',
  'lib/context/unified-state-manager.js',
]);

// Roots to scan (source code only — skip node_modules, tests, build output)
const SCAN_ROOTS = ['lib', 'scripts'];
const SCAN_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts']);

// Match `.from('claude_sessions').update(` or `.from("claude_sessions").update(`
// as well as `.from(\`claude_sessions\`).update(` — these are the supabase-js write
// patterns that could omit current_branch.
const SUPABASE_WRITE_RE = /\.from\(\s*['"`]claude_sessions['"`]\s*\)\s*\.update\(/;

function* walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      // Skip test directories — they may have fixtures that should be exempt
      if (entry.name === 'tests' || entry.name === '__tests__' || entry.name === '.worktrees') continue;
      // Skip archived / example dirs
      if (entry.name === 'archived-sd-scripts') continue;
      yield* walk(full);
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

// File is compliant if either (a) it's explicitly allowlisted above, OR (b) it
// imports/requires `session-writer` and references `stampBranch`. This means
// migrating a new writer to the helper immediately satisfies the guard without
// editing this test.
const STAMP_BRANCH_RE = /session-writer(?:\.cjs)?['"`]|\bstampBranch\b/;

describe('LINT-SESSION-WRITER-001: no raw claude_sessions.update outside helper', () => {
  it('source tree has no bypass writes', () => {
    const violations = [];
    for (const root of SCAN_ROOTS) {
      const rootPath = path.join(repoRoot, root);
      if (!fs.existsSync(rootPath)) continue;
      for (const file of walk(rootPath)) {
        const relative = path.relative(repoRoot, file).split(path.sep).join('/');
        if (ALLOWLIST.has(relative)) continue;
        let content;
        try {
          content = fs.readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        if (!SUPABASE_WRITE_RE.test(content)) continue;
        // Write present — check whether file has stampBranch usage
        if (STAMP_BRANCH_RE.test(content)) continue;
        violations.push(relative);
      }
    }
    expect(violations, `Files writing raw to claude_sessions without going through lib/session-writer.cjs:\n  ${violations.join('\n  ')}\n\nRoute the write through stampBranch() from lib/session-writer.cjs, or add the file to the documented ALLOWLIST in this test with a rationale.`).toEqual([]);
  });
});
