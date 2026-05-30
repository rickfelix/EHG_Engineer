/**
 * SD-LEO-INFRA-WORKTREE-CONTENTION-CLEANUP-001 — FR-5 / AC-6 + FR-6.
 *
 * FR-5 static guards: pre-tool-enforce.cjs runs main() on require (fail-open
 * hook) so it cannot be required in-process; we pin the strand-recovery wiring
 * statically so a regression that drops it (and re-hard-blocks a stranded
 * session) fails CI. The guard MUST:
 *   - confirm a strand via an active claim whose worktree_path no longer exists,
 *   - degrade to a WARN (not block) ONLY on positive confirmation,
 *   - run the strand check BEFORE the hard block, behind a flag, fail-closed.
 *
 * FR-6: logReapDecision emits a single structured (JSON) skip-reason line.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { logReapDecision } from '../../lib/worktree-reapability.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hookSrc = readFileSync(join(repoRoot, 'scripts/hooks/pre-tool-enforce.cjs'), 'utf8');

describe('FR-5 — pre-tool-enforce.cjs strand recovery (static guards)', () => {
  it('defines detectStrandedClaim querying strategic_directives_v2 by claiming_session_id', () => {
    expect(hookSrc).toMatch(/async function detectStrandedClaim\(/);
    expect(hookSrc).toContain('claiming_session_id=eq.');
    expect(hookSrc).toContain('worktree_path');
  });

  it('confirms a strand only when worktree_path no longer exists (fail-closed null otherwise)', () => {
    expect(hookSrc).toMatch(/!fs\.existsSync\(r\.worktree_path\)/);
    // Conservative: a catch / uncertain path returns null (preserves hard block).
    expect(hookSrc).toMatch(/return null;\s*\/\/ any error/);
  });

  it('the strand check runs BEFORE the hard block on main', () => {
    const strandIdx = hookSrc.indexOf('detectStrandedClaim(_SESSION_ID)');
    const blockIdx = hookSrc.indexOf("'WORKTREE-HYGIENE-MAIN'");
    expect(strandIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeGreaterThan(-1);
    expect(strandIdx).toBeLessThan(blockIdx);
  });

  it('degrades to a warn (WORKTREE-HYGIENE-STRANDED), not a block, when stranded', () => {
    expect(hookSrc).toContain('WORKTREE-HYGIENE-STRANDED');
    expect(hookSrc).toMatch(/STRANDED-RECOVERY/);
  });

  it('the hard-block path is preserved for the non-stranded case (still exit 2)', () => {
    // The else branch must still hard-block via auditAndExit(..., 2).
    expect(hookSrc).toMatch(/await auditAndExit\(auditPromise, 2\)/);
  });

  it('FR-6: strand recovery is flag-gated (LEO_WORKTREE_STRAND_RECOVERY)', () => {
    expect(hookSrc).toContain('LEO_WORKTREE_STRAND_RECOVERY');
  });
});

describe('FR-6 — logReapDecision structured skip-reason line', () => {
  it('emits one JSON line containing decision + reason', () => {
    const lines = [];
    logReapDecision(
      { worktree: '/tmp/.worktrees/SD-X', decision: 'skip', reason: 'dirty_tree' },
      (m) => lines.push(m),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[reapability]');
    const json = lines[0].slice(lines[0].indexOf('{'));
    const parsed = JSON.parse(json);
    expect(parsed.decision).toBe('skip');
    expect(parsed.reason).toBe('dirty_tree');
    expect(parsed.worktree).toContain('/tmp/.worktrees/sd-x'); // normalized lowercase
  });
});
