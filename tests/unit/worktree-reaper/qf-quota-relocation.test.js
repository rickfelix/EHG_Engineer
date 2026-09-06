/**
 * SD-LEO-INFRA-WORKTREE-REAPER-PRESERVE-001 FR-5 (TS-9): QF worktree provisioning and
 * the quota check move from create-quick-fix.js MINT time to qf-start.js CLAIM time.
 *
 * Both scripts.js are top-level CLI scripts with process.exit calls and real DB side
 * effects — matching the established convention in
 * tests/unit/claim-liveness-fence-qf-surfaces-order.test.js, these are SOURCE-ORDER /
 * static-content assertions, not full behavioural execution.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('FR-5 AC-2/AC-3 — scripts/qf-start.js checks quota before claim_sd, then provisions', () => {
  const src = read('scripts/qf-start.js');

  it('calls enforceWorktreeQuota', () => {
    expect(src).toContain('enforceWorktreeQuota(');
  });

  it('calls it BEFORE the claim_sd RPC — a refusal after the write still pins the row', () => {
    const quotaIdx = src.indexOf('enforceWorktreeQuota(');
    const rpcIdx = src.indexOf("supabase.rpc('claim_sd'");
    expect(quotaIdx, 'quota check not found').toBeGreaterThan(-1);
    expect(rpcIdx, 'claim_sd call not found').toBeGreaterThan(-1);
    expect(quotaIdx, 'the quota check must precede claim_sd, or a full pool leaks a claim')
      .toBeLessThan(rpcIdx);
  });

  it('on WORKTREE_QUOTA_EXCEEDED, exits before ever reaching the claim_sd call site', () => {
    const quotaIdx = src.indexOf('enforceWorktreeQuota(');
    const exceededIdx = src.indexOf('WORKTREE_QUOTA_EXCEEDED', quotaIdx);
    const safeExitIdx = src.indexOf('safeExit(3)', exceededIdx);
    const rpcIdx = src.indexOf("supabase.rpc('claim_sd'");
    expect(exceededIdx, 'WORKTREE_QUOTA_EXCEEDED handling not found after the quota check').toBeGreaterThan(quotaIdx);
    expect(safeExitIdx, 'no exit found in the quota-exceeded branch').toBeGreaterThan(exceededIdx);
    expect(safeExitIdx, 'the quota-exceeded exit must come before claim_sd is ever called')
      .toBeLessThan(rpcIdx);
  });

  it('provisions the worktree AFTER a successful claim (createWorkTypeWorktree after claim_sd)', () => {
    const rpcIdx = src.indexOf("supabase.rpc('claim_sd'");
    const provisionIdx = src.indexOf('createWorkTypeWorktree(');
    expect(provisionIdx, 'worktree provisioning not found').toBeGreaterThan(-1);
    expect(provisionIdx, 'provisioning must come after the claim succeeds, not before')
      .toBeGreaterThan(rpcIdx);
  });
});

describe('FR-5 AC-1 — scripts/create-quick-fix.js never leaves a leaked claim on quota exhaustion', () => {
  const src = read('scripts/create-quick-fix.js');

  it('the WORKTREE_QUOTA_EXCEEDED branch does not process.exit', () => {
    const exceededIdx = src.indexOf("err.errorCode === 'WORKTREE_QUOTA_EXCEEDED'");
    expect(exceededIdx, 'WORKTREE_QUOTA_EXCEEDED branch not found').toBeGreaterThan(-1);
    // Scope the search to this branch only (up to the next `if (` sibling or catch close).
    const branchEnd = src.indexOf('console.log(\'   Falling back to branch-only mode', exceededIdx);
    const branch = src.slice(exceededIdx, branchEnd > -1 ? branchEnd : exceededIdx + 1500);
    // Strip `//` comment lines first — this branch's own explanatory comment legitimately
    // narrates the historical bug ("used to process.exit(1) here"), which would otherwise
    // false-fail a raw substring/regex check against the LIVE code.
    const codeOnly = branch.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(codeOnly, 'the quota-exceeded branch must never process.exit -- that leaves the row claimed').not.toMatch(/process\.exit/);
  });

  it('the WORKTREE_QUOTA_EXCEEDED branch releases the claim it set earlier (claiming_session_id: null)', () => {
    const exceededIdx = src.indexOf("err.errorCode === 'WORKTREE_QUOTA_EXCEEDED'");
    const branchEnd = src.indexOf('console.log(\'   Falling back to branch-only mode', exceededIdx);
    const branch = src.slice(exceededIdx, branchEnd > -1 ? branchEnd : exceededIdx + 1500);
    expect(branch).toContain('claiming_session_id: null');
  });

  it('the WORKTREE_QUOTA_EXCEEDED branch returns via printNextSteps (graceful, not a crash)', () => {
    const exceededIdx = src.indexOf("err.errorCode === 'WORKTREE_QUOTA_EXCEEDED'");
    const branchEnd = src.indexOf('console.log(\'   Falling back to branch-only mode', exceededIdx);
    const branch = src.slice(exceededIdx, branchEnd > -1 ? branchEnd : exceededIdx + 1500);
    expect(branch).toMatch(/return printNextSteps\(/);
  });
});
