/**
 * SD-FDBK-INFRA-START-NON-INTERACTIVE-001 — CLI-entrypoint test for the
 * sd-start own-conflict re-attach decision (AC-7).
 *
 * The underlying classifyWorktreeOwnership is unit-tested in
 * tests/unit/lib/exec-context-guard.test.js. This file covers the DECISION that
 * scripts/sd-start.js wires it into at two sites (worktree creation-failure
 * path + resolution-error catch): match an `already_checked_out` conflict,
 * parse the conflict path from the git error, classify ownership, and re-attach
 * (exit 2, claim PRESERVED) ONLY when the conflict is this SD's own worktree.
 * That decision is extracted into decideOwnConflictReattach so it is testable
 * without spawning the CLI (sd-start.js has heavy top-level / DB side effects).
 *
 * The two consumer sites map the decision to process exit codes:
 *   reattach:true  -> process.exit(2)  (re-attach, claim preserved)
 *   reattach:false -> releaseClaim + process.exit(1)
 * so asserting the boolean here pins the exit-code behavior at both sites.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';

const { decideOwnConflictReattach } = await import('../../../lib/exec-context-guard.mjs');

// Same absolute-looking path used for both the conflict (inside the git error
// string) and the expected worktree dir, so path.resolve() makes them equal
// regardless of the runner platform.
const OWN = 'C:/main/.worktrees/sd/SD-XXX-001';
const FOREIGN = 'C:/main/.worktrees/sd/SD-OTHER-002';
const gitErr = (p) => `fatal: 'feat/SD-XXX-001' is already used by worktree at '${p}'`;

describe('SD-FDBK-INFRA-START-NON-INTERACTIVE-001 — decideOwnConflictReattach (AC-7)', () => {
  it('TS-1: own-conflict (creation-failure shape) -> reattach:true (CLI exit 2, claim preserved)', () => {
    // detail = worktreeInfo.error/errorCode at scripts/sd-start.js creation-failure path
    const result = decideOwnConflictReattach('already_checked_out', gitErr(OWN), OWN);
    expect(result.reattach).toBe(true);
    expect(result.expectedPath).toBe(path.resolve(OWN));
  });

  it('TS-2: own-conflict (resolution-error shape) -> reattach:true (CLI exit 2)', () => {
    // detail = wtErr.message, expectedPath = wtErr.expectedWorktreePath at the catch site
    const result = decideOwnConflictReattach('already_checked_out', gitErr(OWN), OWN);
    expect(result.reattach).toBe(true);
  });

  it('TS-3: foreign-conflict -> reattach:false (CLI releases claim + exit 1)', () => {
    const result = decideOwnConflictReattach('already_checked_out', gitErr(FOREIGN), OWN);
    expect(result.reattach).toBe(false);
  });

  it('TS-4: non-already_checked_out code -> reattach:false even when paths would match', () => {
    const result = decideOwnConflictReattach('unknown', gitErr(OWN), OWN);
    expect(result.reattach).toBe(false);
  });

  it('TS-5: already_checked_out but conflict detail has no parseable path -> reattach:false', () => {
    const result = decideOwnConflictReattach('already_checked_out', 'fatal: some unrelated worktree error', OWN);
    expect(result.reattach).toBe(false);
  });

  it('TS-6: already_checked_out with valid detail but missing expectedPath -> reattach:false', () => {
    expect(decideOwnConflictReattach('already_checked_out', gitErr(OWN), null).reattach).toBe(false);
    expect(decideOwnConflictReattach('already_checked_out', gitErr(OWN), undefined).reattach).toBe(false);
  });
});
