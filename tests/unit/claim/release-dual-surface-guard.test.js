/**
 * SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001 (escalated from QF-20260712-817) — FR-4 static guard.
 *
 * A claim lives on TWO surfaces that must be released together:
 *   • SD-side      strategic_directives_v2: claiming_session_id (+ active_session_id, is_working_on)
 *   • session-side claude_sessions:         sd_key (+ worktree_path, worktree_branch)
 *
 * Several JS release paths historically cleared only ONE surface, leaving the other stuck so
 * the belt kept seeing a dead seat's SD as CLAIMED (~45min fleet stall, witnessed 2026-07-12).
 * The fix routes every genuinely-desynced JS path through lib/claim/release-claim-both-surfaces.mjs.
 *
 * This guard prevents the class from silently reappearing:
 *   (1) any claude_sessions UPDATE that nulls sd_key MUST also null worktree_path + worktree_branch
 *       together (the ck_claude_sessions_worktree_state_consistency CHECK raises 23514 otherwise);
 *   (2) the routed sites still call the unified helper (no silent revert to a single-surface clear);
 *   (3) the helper itself co-clears both surfaces with holder-pinned CAS.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const read = (rel) => readFileSync(resolve(REPO_ROOT, rel), 'utf8');

const HELPER = 'lib/claim/release-claim-both-surfaces.mjs';

// Files that were routed through the unified helper. Each must import/call it.
const ROUTED_SITES = [
  'lib/claim-validity-gate.js',
  'lib/claim-guard.mjs',
  'lib/commands/claim-command.js',
  'lib/coordinator/singleton-refresh-sequencer.cjs',
  'scripts/coordinator-cold-recovery.cjs',
  'scripts/claim-orchestrator-for-rollup.mjs',
  'scripts/modules/handoff/gates/multi-session-claim-gate.js',
];

// Files scanned for the session-side worktree-together invariant (routed sites + the helper).
// After the fix, the only remaining DIRECT `claude_sessions` sd_key:null clear in these files is
// singleton-refresh-sequencer's retire (which already nulls worktree_* together) and the helper.
const WORKTREE_INVARIANT_FILES = [HELPER, ...ROUTED_SITES];

describe('SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001 — dual-surface release guard', () => {
  it('the unified helper exists and co-clears both surfaces with holder-pinned CAS', () => {
    expect(existsSync(resolve(REPO_ROOT, HELPER))).toBe(true);
    const src = read(HELPER);
    expect(src).toContain('export async function releaseClaimBothSurfaces');
    // Session-side clear nulls all three worktree/claim columns together (R3).
    expect(src).toMatch(/sd_key:\s*null/);
    expect(src).toMatch(/worktree_path:\s*null/);
    expect(src).toMatch(/worktree_branch:\s*null/);
    // SD-side clear + holder-pinned CAS on both surfaces (R1).
    expect(src).toMatch(/claiming_session_id:\s*null/);
    expect(src).toMatch(/\.eq\(\s*['"]claiming_session_id['"]/); // SD-side holder CAS
    expect(src).toMatch(/\.eq\(\s*['"]sd_key['"]/);              // session-side sdKey CAS
    // R6: readback asserts OLD-HOLDER-GONE, not `=== null`.
    expect(src).toMatch(/oldHolderGone/);
  });

  it('every claude_sessions UPDATE that nulls sd_key also nulls worktree_path + worktree_branch (R3)', () => {
    for (const rel of WORKTREE_INVARIANT_FILES) {
      const src = read(rel);
      const fromMatches = [...src.matchAll(/\.from\(\s*['"]claude_sessions['"]\s*\)/g)];
      for (const m of fromMatches) {
        const window = src.slice(m.index, m.index + 1000);
        const updateMatch = window.match(/\.update\s*\(\s*\{([\s\S]*?)\}\s*\)/);
        if (!updateMatch) continue; // SELECT, not UPDATE
        const payload = updateMatch[1];
        if (!/sd_key\s*:\s*null/.test(payload)) continue; // not a release-shaped UPDATE
        const line = src.slice(0, m.index + updateMatch.index).split('\n').length;
        expect(payload, `${rel}:~${line} nulls sd_key without worktree_path`).toMatch(/worktree_path\s*:\s*null/);
        expect(payload, `${rel}:~${line} nulls sd_key without worktree_branch`).toMatch(/worktree_branch\s*:\s*null/);
      }
    }
  });

  it('routed sites still call releaseClaimBothSurfaces (no revert to single-surface clears)', () => {
    for (const rel of ROUTED_SITES) {
      const src = read(rel);
      expect(src, `${rel} no longer routes through the unified release helper`)
        .toMatch(/releaseClaimBothSurfaces/);
    }
  });

  it('the R4 exclusion (releaseClaimOnPROpen) documents its intentional single-surface clear', () => {
    // A PR-open release keeps the worker ALIVE, so it must NOT be routed (would evict the worktree).
    const src = read('lib/claim-lifecycle-release.mjs');
    expect(src).toMatch(/R4 exclusion/);
    expect(src).toMatch(/SD-LEO-FIX-CLAIM-RELEASE-DESYNC-001/);
  });
});
