/**
 * SD-LEO-FIX-STALE-SESSION-SWEEP-001 — three residual claim-lifecycle defects in
 * scripts/stale-session-sweep.cjs. Static-invariant tests (the established pattern for this
 * inline-heavy sweep file, cf. stale-session-sweep-release-payload.test.js) pinning the exact
 * predicates the prospective LEAD testing pass required (R1/R2/R3/R4/R7/R9/R11).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../../../');
const SRC = readFileSync(resolve(REPO_ROOT, 'scripts/stale-session-sweep.cjs'), 'utf8');

// Helper: extract the source slice for a labelled FR block so assertions are scoped.
function block(after, before) {
  const a = SRC.indexOf(after);
  const b = SRC.indexOf(before, a);
  expect(a, `anchor not found: ${after}`).toBeGreaterThanOrEqual(0);
  return SRC.slice(a, b > a ? b : a + 2500);
}

describe('FR-1: terminal-target WORK_ASSIGNMENT drain', () => {
  // `before` anchor re-synced: the old 'for (const s of activeSessions)' literal no longer exists
  // in the source, so block() silently fell back to a 2500-char window that truncated before the
  // read_at stamp (line ~1797) and the fail-open WORK_ASSIGNMENT_TERMINAL_DRAIN string (~1803).
  // Anchor on the next top-level statement after the drain's try/catch instead.
  const fr1 = block('drain WORK_ASSIGNMENT rows whose target SD/QF', 'await dispatchWorkAssignmentsIfAllowed');
  it('stamps read_at (drain marker), never hard-DELETE on these rows', () => {
    expect(fr1).toMatch(/\.update\(\{\s*read_at: now\.toISOString\(\)\s*\}\)/);
    expect(fr1).not.toMatch(/\.delete\(\)/);
  });
  it('branches the terminal set by target shape (SD vs QF)', () => {
    expect(fr1).toMatch(/sdAssignTargets[\s\S]*\['completed', 'cancelled', 'deferred'\]/); // SD: deferred, not escalated
    expect(fr1).toMatch(/qfAssignTargets[\s\S]*\['completed', 'cancelled', 'escalated', 'closed'\]/); // QF: escalated+closed, not deferred
  });
  it('keys on the target_sd column and applies an assignment-age floor', () => {
    expect(fr1).toMatch(/message_type', 'WORK_ASSIGNMENT'/);
    expect(fr1).toMatch(/\.not\('target_sd', 'is', null\)/);
    expect(fr1).toMatch(/\.lt\('created_at', assignAgeCutoff\)/);
  });
  it('is fail-open (try/catch → warnings, never throws)', () => {
    expect(fr1).toMatch(/WORK_ASSIGNMENT_TERMINAL_DRAIN: skipped due to error/);
  });
});

describe('FR-2: QF-aware orphan path + claim-age grace', () => {
  const fr2 = block('a QF-claiming session carries sd_key', 'const orphanedClaims');
  it('builds a quick_fixes existence set with a non-colliding column tuple (R11)', () => {
    expect(fr2).toMatch(/from\('quick_fixes'\)\.select\('id'\)/);
    // R11 intent: the FR-2 existence set must NOT collide with the claim-clear tuple selects.
    // Two tuple selects are sanctioned — BOTH live inside clearStaleQfClaims (the QF-211
    // open/in_progress pass + the QF-20260711-176 TERMINAL pass); none in the FR-2 block.
    const colliding = (SRC.match(/select\('id, status, claiming_session_id'\)/g) || []).length;
    expect(colliding).toBe(2);
    expect(fr2).not.toMatch(/select\('id, status, claiming_session_id'\)/);
    const helperIdx = SRC.indexOf('async function clearStaleQfClaims');
    const helperEnd = SRC.indexOf('\n}', SRC.indexOf('QF_CLAIM_SWEEP', helperIdx));
    let searchFrom = 0;
    for (let i = 0; i < colliding; i++) {
      const at = SRC.indexOf("select('id, status, claiming_session_id')", searchFrom);
      expect(at).toBeGreaterThan(helperIdx);
      expect(at).toBeLessThan(helperEnd);
      searchFrom = at + 1;
    }
  });
  it('holds a QF claim when the QF exists OR was claimed within the grace window', () => {
    expect(fr2).toMatch(/QF_CLAIM_GRACE_SECONDS/);
    expect(fr2).toMatch(/qfExistsSet\.has\(s\.sd_key\)/);
    expect(fr2).toMatch(/ageSec < QF_CLAIM_GRACE_SECONDS/);
  });
  it('excludes held QF claims from orphanedClaims (the real fix)', () => {
    expect(SRC).toMatch(/const orphanedClaims = classified\.filter\(s => !sdStatusMap\[s\.sd_key\] && !isHeldQfClaim\(s\)\)/);
  });
  it('grace window is env-tunable via QF_CLAIM_GRACE_SECONDS', () => {
    expect(fr2).toMatch(/process\.env\.QF_CLAIM_GRACE_SECONDS/);
  });
});

describe('FR-3: cross-signal skip only on null-claim (not deferred alone)', () => {
  it('sdStatusMap query selects claiming_session_id', () => {
    expect(SRC).toMatch(/select\('sd_key, status, completion_date, claiming_session_id'\)/);
  });
  const fr3 = block('a zombie process_tick from a dead session can make', 'checkPreClaimEvidence(supabase');
  it('skips the cross-signal HOLD only when claiming_session_id IS NULL', () => {
    expect(fr3).toMatch(/sdUnclaimed\s*=\s*!!sdMetaForGate && sdMetaForGate\.claiming_session_id == null/);
    expect(fr3).toMatch(/if \(s\.sd_key && !sdUnclaimed\)/);
  });
  it('documents that status alone (deferred) is NOT sufficient', () => {
    expect(fr3).toMatch(/parked-but-ALIVE worker is deferred \+ still claimed/);
  });
});

describe('R12: no new claude_sessions release UPDATE missing the null-out set', () => {
  it('FR-2 claude_sessions access is a SELECT (claimed_at proxy), not a release UPDATE', () => {
    expect(SRC).toMatch(/from\('claude_sessions'\)\.select\('session_id, claimed_at'\)/);
  });
});
