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

// SD-FDBK-FIX-COMPLETE-QUICK-FIX-001: the remaining prompt sites + the TTY safety net.
const compliancePath = fileURLToPath(new URL('../../scripts/modules/complete-quick-fix/compliance-loop.js', import.meta.url));
const verificationPath = fileURLToPath(new URL('../../scripts/modules/complete-quick-fix/verification.js', import.meta.url));
const cliPath = fileURLToPath(new URL('../../scripts/modules/complete-quick-fix/cli.js', import.meta.url));
const compliance = readFileSync(compliancePath, 'utf8');
const verification = readFileSync(verificationPath, 'utf8');
const cli = readFileSync(cliPath, 'utf8');

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

describe('SD-FDBK-FIX-COMPLETE-QUICK-FIX-001: residual prompt gaps closed under --non-interactive', () => {
  it('compliance-loop refinement prompt auto-skips under --non-interactive (not only --force-complete)', () => {
    // guard widened from `flags.forceComplete` to include `|| flags.nonInteractive`
    expect(compliance).toMatch(/\(flags\.forceComplete \|\| flags\.nonInteractive\)/);
    // ordering: the widened guard precedes the auto-refinement prompt
    const idxGuard = compliance.indexOf('flags.nonInteractive');
    const idxPrompt = compliance.indexOf("Attempt auto-refinement?");
    expect(idxGuard).toBeGreaterThan(-1);
    expect(idxGuard).toBeLessThan(idxPrompt);
  });

  it('validateLOC escalate prompt is skipped (returns false) under --non-interactive', () => {
    const idxGuard = verification.indexOf('flags.nonInteractive');
    const idxPrompt = verification.indexOf("await prompt('Auto-escalate to SD?");
    expect(idxGuard).toBeGreaterThan(-1);
    expect(idxPrompt).toBeGreaterThan(-1);
    expect(idxGuard).toBeLessThan(idxPrompt); // guard BEFORE the prompt
    expect(verification).toMatch(/if \(flags\.nonInteractive\)[\s\S]*?return false/);
  });

  it('orchestrator threads nonInteractive into validateLOC and runComplianceWithRefinement (no dead-code guards)', () => {
    expect(orch).toMatch(/validateLOC\([^;]*nonInteractive:\s*options\.nonInteractive/);
    expect(orch).toMatch(/runComplianceWithRefinement\([^;]*nonInteractive:\s*options\.nonInteractive/);
  });

  it('cli prompt() rejects on EOF-without-answer (forgotten --non-interactive) so it fails-fast not hangs; piped input still resolves', () => {
    // isTTY is unreliable (undefined under the Bash tool), so use readline close + an answered-guard.
    expect(cli).toMatch(/rl\.on\('close'/);
    expect(cli).toMatch(/let answered = false/);
    expect(cli).toMatch(/if \(!answered\)/);
    // the answer callback sets answered=true so a piped/typed answer wins over the close-reject
    expect(cli).toMatch(/answered = true/);
  });
});
