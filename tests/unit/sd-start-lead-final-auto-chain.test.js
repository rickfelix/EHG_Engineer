/**
 * SD-LEO-INFRA-ADOPTED-RESUME-FINAL-001 (FR-1) — sd-start.js auto-chains
 * LEAD-FINAL-APPROVAL for a stranded pending_approval/LEAD_FINAL SD instead
 * of only printing it as a suggestion. Static-pin pattern (matches this
 * file's own established convention — see sd-start-claim-lifecycle.test.js).
 *
 * TS-2 (regression): every other phase/status must be byte-identical to the
 * pre-FR-1 print-only behavior. Covered here by asserting the new branch is
 * gated on isStrandedAtLeadFinal && wtCwdForFinal, and that the pre-existing
 * needsBrainstorm/else branches are untouched and still reachable.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SD_START_PATH = resolve(__dirname, '..', '..', 'scripts/sd-start.js');
const src = readFileSync(SD_START_PATH, 'utf8');

function sliceAfterNextHandoff() {
  const idx = src.indexOf('const nextHandoff = await getNextHandoff(sd);');
  expect(idx, 'nextHandoff computation not found').toBeGreaterThan(0);
  return src.slice(idx, idx + 3500);
}

describe('FR-1: auto-chain gating conditions', () => {
  it('gates the new branch on status=pending_approval AND current_phase=LEAD_FINAL AND a resolved worktree cwd', () => {
    const slice = sliceAfterNextHandoff();
    expect(slice).toMatch(/isStrandedAtLeadFinal\s*=\s*sd\.status\s*===\s*'pending_approval'\s*&&\s*sd\.current_phase\s*===\s*'LEAD_FINAL'/);
    expect(slice).toMatch(/wtCwdForFinal\s*=\s*worktreeInfo\?\.cwd\s*\|\|\s*worktreeInfo\?\.worktree\?\.path\s*\|\|\s*null/);
    expect(slice).toMatch(/if\s*\(\s*isStrandedAtLeadFinal\s*&&\s*wtCwdForFinal\s*\)/);
  });

  it('executes the auto-chain via execSync scoped to the resolved worktree cwd, with a >=300000ms timeout', () => {
    const slice = sliceAfterNextHandoff();
    const execIdx = slice.indexOf('execSync(`node scripts/handoff.js execute ${nextHandoff} ${effectiveId}`');
    expect(execIdx, 'execSync auto-chain call not found').toBeGreaterThan(0);
    const execBlock = slice.slice(execIdx, execIdx + 400);
    expect(execBlock).toMatch(/cwd:\s*wtCwdForFinal/);
    expect(execBlock).toMatch(/timeout:\s*300000/);
    expect(execBlock).toMatch(/CLAUDE_SESSION_ID:\s*session\.session_id/);
  });

  it('detects PR_MERGE_VERIFICATION in the failure path and prints the merge-then-retry remediation (does not treat it as an sd-start.js crash)', () => {
    const slice = sliceAfterNextHandoff();
    const catchIdx = slice.indexOf('catch (finalErr)');
    expect(catchIdx, 'auto-chain catch block not found').toBeGreaterThan(0);
    const catchBlock = slice.slice(catchIdx, catchIdx + 900);
    expect(catchBlock).toMatch(/PR_MERGE_VERIFICATION/);
    expect(catchBlock).toMatch(/blocked on PR_MERGE_VERIFICATION/i);
    // The catch block itself must not re-throw / must not call process.exit — sd-start.js
    // should complete normally (falls through to the existing progress-tick + summary tail).
    expect(catchBlock).not.toMatch(/throw /);
    expect(catchBlock).not.toMatch(/process\.exit/);
  });
});

describe('TS-2 (regression): non-LEAD_FINAL / non-pending_approval behavior is unchanged', () => {
  it('the pre-existing needsBrainstorm branch is preserved verbatim as an else-if, unreachable when isStrandedAtLeadFinal is true', () => {
    const slice = sliceAfterNextHandoff();
    expect(slice).toMatch(/\}\s*else if\s*\(\s*needsBrainstorm\s*&&\s*sd\.status\s*===\s*'draft'\s*\)\s*\{/);
    expect(slice).toMatch(/\/brainstorm \$\{sd\.title\}/);
  });

  it('the pre-existing default Next Action print branch is preserved verbatim as the final else', () => {
    const slice = sliceAfterNextHandoff();
    expect(slice).toMatch(/\}\s*else\s*\{\s*\n\s*console\.log\(`\\n\$\{colors\.bold\}Next Action:\$\{colors\.reset\}`\);/);
    expect(slice).toMatch(/no_deterministic_identity failures at claim-validity gate/);
  });

  it('the new branch is the FIRST condition checked (highest specificity), so a stranded SD never falls through to the generic print branch', () => {
    const slice = sliceAfterNextHandoff();
    const strandedIdx = slice.indexOf('if (isStrandedAtLeadFinal && wtCwdForFinal)');
    const brainstormIdx = slice.indexOf("else if (needsBrainstorm && sd.status === 'draft')");
    expect(strandedIdx).toBeGreaterThan(0);
    expect(brainstormIdx).toBeGreaterThan(strandedIdx);
  });
});
