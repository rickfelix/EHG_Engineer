/**
 * Regression: complete-quick-fix.js prompts must be guarded under --non-interactive.
 *
 * QF-20260529-888 (found dogfooding QF-852): four operator prompts checked only
 * flags.forceComplete, so a plain --non-interactive run rejected with [NON_INTERACTIVE]
 * when a value was absent. The verificationNotes prompt actually FAILED completion; the
 * "Merge to main now?" prompt rejected (caught but noisy); commit/push shared the gap.
 * Fix: guard all four — verificationNotes skipped, commit/push auto-confirmed, merge
 * skipped-with-log (auto-merge without CI is unsafe) — under --non-interactive.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const orchPath = fileURLToPath(
  new URL('../../scripts/modules/complete-quick-fix/orchestrator.js', import.meta.url)
);
const gitOpsPath = fileURLToPath(
  new URL('../../scripts/modules/complete-quick-fix/git-operations.js', import.meta.url)
);

const orch = readFileSync(orchPath, 'utf8');
const gitOps = readFileSync(gitOpsPath, 'utf8');

describe('complete-quick-fix prompts guarded under --non-interactive (QF-20260529-888)', () => {
  it('verificationNotes prompt is skipped under --non-interactive / --force-complete', () => {
    expect(orch).toMatch(
      /if \(!verificationNotes && !options\.nonInteractive && !options\.forceComplete\)/
    );
  });

  it('commit + push auto-confirm under --non-interactive (not only --force-complete)', () => {
    expect(gitOps).toMatch(/const autoConfirmGit = flags\.forceComplete \|\| flags\.nonInteractive/);
    expect(gitOps).toMatch(/shouldCommit = autoConfirmGit/);
    expect(gitOps).toMatch(/shouldPush = autoConfirmGit/);
  });

  it('merge is skipped (not prompted) under --non-interactive', () => {
    expect(gitOps).toMatch(/skipping direct merge/);
    expect(gitOps).toMatch(/:\s*flags\.nonInteractive/); // shouldMerge has a nonInteractive branch
  });

  it('interactive mode still prompts (regression guard — behavior unchanged when no flags)', () => {
    expect(gitOps).toMatch(/await prompt\('   Merge to main now\?/);
    expect(gitOps).toMatch(/await prompt\('   Commit these changes\?/);
    expect(orch).toMatch(/await prompt\('\\nVerification notes/);
  });
});
