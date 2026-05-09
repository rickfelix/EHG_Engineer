/**
 * QF-20260508-230: stale-session-sweep release UPDATE must include worktree_branch:null
 * at ALL THREE release sites (5th-witness PAT-LEO-INFRA-WRITER-CONSUMER-ASYMMETRY-001).
 *
 * The CHECK constraint `ck_claude_sessions_worktree_state_consistency` (added 2026-05-02)
 * requires `sd_key IS NOT NULL OR (worktree_path IS NULL AND worktree_branch IS NULL)`.
 * Sweep release UPDATEs that null sd_key + worktree_path but leave worktree_branch populated
 * silently fail via PostgREST partial-rollback, causing 5-min churn loops.
 *
 * QF-20260504-081 fixed ONE site (the dead-session release path); QF-20260508-230 fixes
 * the two sibling sites (workingOnCompleted + conflict-eviction). This test pins all three.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SOURCE = readFileSync(resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');

describe('QF-20260508-230 — stale-session-sweep release payload invariant', () => {
  it('release payload includes worktree_branch:null at every claude_sessions UPDATE site', () => {
    // Find every occurrence of `.from('claude_sessions')` followed within ~250 chars by
    // an `.update({` block. Each such block MUST contain `worktree_branch: null`.
    const fromMatches = [...SOURCE.matchAll(/\.from\(\s*['"]claude_sessions['"]\s*\)/g)];
    expect(fromMatches.length).toBeGreaterThanOrEqual(3);

    for (const m of fromMatches) {
      const start = m.index;
      // Look ahead up to 1000 chars for an `.update({...})` block
      const window = SOURCE.slice(start, start + 1000);
      const updateMatch = window.match(/\.update\s*\(\s*\{([\s\S]*?)\}\s*\)/);
      if (!updateMatch) continue; // not all from() are UPDATEs (some are SELECT)
      const updatePayload = updateMatch[1];

      // Skip payloads that don't null sd_key (those are NOT release UPDATEs)
      if (!/sd_key\s*:\s*null/.test(updatePayload)) continue;

      // The release-shaped UPDATE must also null worktree_branch (CHECK invariant)
      const offsetInFile = start + updateMatch.index;
      const lineNumber = SOURCE.slice(0, offsetInFile).split('\n').length;
      expect(updatePayload, `Release UPDATE at line ~${lineNumber} missing worktree_branch:null`)
        .toMatch(/worktree_branch\s*:\s*null/);
    }
  });

  it('all 3 known release sites are still wired (regression guard against accidental removal)', () => {
    // Pin the 3 release reasons we know about. If any of these strings disappears,
    // either the site was removed (intentional refactor — update this test) or accidentally
    // dropped (regression — fix the source).
    expect(SOURCE).toContain('SWEEP_SD_ALREADY_COMPLETED');
    expect(SOURCE).toContain('SWEEP_CONFLICT_RESOLUTION');
    expect(SOURCE).toMatch(/releaseReason/); // dynamic reason for dead-session path
  });

  it('CHECK constraint name appears in code comment for documentation traceability', () => {
    // Pattern from Memory: documenting the CHECK in the source so the next developer
    // sees WHY worktree_branch:null is mandatory.
    expect(SOURCE).toMatch(/ck_claude_sessions_worktree_state_consistency/);
  });
});
