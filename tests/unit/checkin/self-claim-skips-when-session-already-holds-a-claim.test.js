/**
 * SD-LEO-INFRA-FIX-CLAIM-EVICTION-001 (FR-3) — all three self-claim producer steps
 * (critical-qf-jump.cjs, merged-pool-self-claim.cjs, self-claim-qf.cjs) must skip self-claim
 * uniformly when the session already authoritatively holds ANY live claim (SD or QF), via the
 * shared lib/claim/get-my-claims.cjs predicate -- not a new, separate guard on only one tier, and
 * not keyed on ctx.mySd (a one-shot mirror nulled at multiple points in the same pipeline).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const REPO = path.resolve(__dirname, '../../..');

const criticalQfJump = require_(path.join(REPO, 'lib/checkin/steps/critical-qf-jump.cjs'));
const mergedPoolSelfClaim = require_(path.join(REPO, 'lib/checkin/steps/merged-pool-self-claim.cjs'));
const selfClaimQf = require_(path.join(REPO, 'lib/checkin/steps/self-claim-qf.cjs'));

const SESSION_ID = 'test-session-already-claims';

/** Mirrors getMyClaims' exact two-query shape (lib/claim/get-my-claims.cjs). Tracks every
 * sb.from() call so a test can assert the step never reached past the guard into its own
 * deeper queries. */
function makeSb({ sdClaims = [], qfClaims = [] } = {}) {
  const fromCalls = [];
  return {
    fromCalls,
    from(table) {
      fromCalls.push(table);
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ eq: () => Promise.resolve({ data: sdClaims, error: null }) }) };
      }
      if (table === 'quick_fixes') {
        return { select: () => ({ eq: () => Promise.resolve({ data: qfClaims, error: null }) }) };
      }
      // Any OTHER table/query reached after the guard would prove the guard did NOT short-circuit.
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    },
  };
}

describe('FR-3: critical-qf-jump.cjs skips when session already holds a claim', () => {
  it('holding an SD claim: does NOT attempt tryClaim, never reaches the critical-QF query', async () => {
    const sb = makeSb({ sdClaims: [{ sd_key: 'SD-HELD-001', status: 'in_progress', current_phase: 'EXEC' }] });
    const tryClaim = vi.fn(async () => ({ ok: true }));
    const ctx = { sb, sessionId: SESSION_ID, sessionMetadata: {}, helpers: { tryClaim, isCriticalQfJumpEligible: () => true, QF_CANDIDATE_LIMIT: 10 } };
    const result = await criticalQfJump.run(ctx);
    expect(result).toBeUndefined();
    expect(tryClaim).not.toHaveBeenCalled();
    // getMyClaims issues exactly 2 calls (SD + QF); no third (critical-QF) query reached.
    expect(sb.fromCalls).toEqual(['strategic_directives_v2', 'quick_fixes']);
  });

  it('holding a QF claim: also skips (both-kinds check, not SD-only)', async () => {
    const sb = makeSb({ qfClaims: [{ id: 'QF-HELD-001', status: 'in_progress' }] });
    const tryClaim = vi.fn(async () => ({ ok: true }));
    const ctx = { sb, sessionId: SESSION_ID, sessionMetadata: {}, helpers: { tryClaim, isCriticalQfJumpEligible: () => true, QF_CANDIDATE_LIMIT: 10 } };
    const result = await criticalQfJump.run(ctx);
    expect(result).toBeUndefined();
    expect(tryClaim).not.toHaveBeenCalled();
  });

  it('FAIL-CLOSED: a getMyClaims read error also skips (never proceeds on an uncertain read)', async () => {
    const sb = {
      from(table) {
        if (table === 'strategic_directives_v2') return { select: () => ({ eq: () => Promise.reject(new Error('boom')) }) };
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };
    const tryClaim = vi.fn(async () => ({ ok: true }));
    const ctx = { sb, sessionId: SESSION_ID, sessionMetadata: {}, helpers: { tryClaim, isCriticalQfJumpEligible: () => true, QF_CANDIDATE_LIMIT: 10 } };
    const result = await criticalQfJump.run(ctx);
    expect(result).toBeUndefined();
    expect(tryClaim).not.toHaveBeenCalled();
  });

  it('holding NO claim: proceeds to the real critical-QF logic (reaches tryClaim)', async () => {
    const sb = {
      fromCalls: [],
      from(table) {
        this.fromCalls.push(table);
        if (table === 'strategic_directives_v2') return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        if (table === 'quick_fixes') {
          return {
            select: () => ({
              eq: () => ({ eq: () => ({ is: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [{ id: 'QF-OPEN-001', status: 'open', severity: 'critical', created_at: new Date().toISOString() }], error: null }) }) }) }) }) }),
            }),
          };
        }
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      },
    };
    const tryClaim = vi.fn(async () => ({ ok: true }));
    const ctx = { sb, sessionId: SESSION_ID, sessionMetadata: {}, helpers: { tryClaim, isCriticalQfJumpEligible: () => true, QF_CANDIDATE_LIMIT: 10 } };
    const result = await criticalQfJump.run(ctx);
    expect(tryClaim).toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});

describe('FR-3: merged-pool-self-claim.cjs skips when session already holds a claim', () => {
  it('holding a claim: does NOT call ensureActiveBaseline or any merged-pool helper', async () => {
    const sb = makeSb({ sdClaims: [{ sd_key: 'SD-HELD-002', status: 'in_progress', current_phase: 'EXEC' }] });
    const ensureActiveBaseline = vi.fn(async () => {});
    const ctx = {
      sb, sessionId: SESSION_ID, sessionMetadata: {}, tierCtx: {}, reservations: null,
      helpers: {
        ensureActiveBaseline, fetchDraftCandidates: vi.fn(), fetchNewestDraftCandidates: vi.fn(),
        fetchFleetCriticalCandidates: vi.fn(), fetchRankedCandidates: vi.fn(), sortByDispatchRank: vi.fn(),
        ladderTopRank: vi.fn(), seatCapabilityIsVerified: vi.fn(() => true), fetchFableWindowActive: vi.fn(),
        claimableForTier: vi.fn(() => []), claimableForRepo: vi.fn(() => []), baselinedCandidateEligible: vi.fn(),
        isSdInFlight: vi.fn(), tryClaim: vi.fn(), tryClaimDraftCandidate: vi.fn(), antiWinddownDirective: vi.fn(() => ''),
        coordinatorReservation: vi.fn(), SELF_CLAIM_CANDIDATE_LIMIT: 5,
      },
      base: {},
    };
    const result = await mergedPoolSelfClaim.run(ctx);
    expect(result).toBeUndefined();
    expect(ensureActiveBaseline).not.toHaveBeenCalled();
    expect(sb.fromCalls).toEqual(['strategic_directives_v2', 'quick_fixes']);
  });
});

describe('FR-3: self-claim-qf.cjs skips when session already holds a claim', () => {
  it('holding a claim: does NOT call selfClaimQuickFix', async () => {
    const sb = makeSb({ sdClaims: [{ sd_key: 'SD-HELD-003', status: 'in_progress', current_phase: 'EXEC' }] });
    const selfClaimQuickFix = vi.fn(async () => ({ action: 'self_claimed_qf', qf: 'QF-SHOULD-NOT-CLAIM' }));
    const ctx = { sb, sessionId: SESSION_ID, sessionMetadata: {}, base: {}, helpers: { selfClaimQuickFix } };
    const result = await selfClaimQf.run(ctx);
    expect(result).toBeUndefined();
    expect(selfClaimQuickFix).not.toHaveBeenCalled();
    expect(sb.fromCalls).toEqual(['strategic_directives_v2', 'quick_fixes']);
  });

  it('holding NO claim: proceeds to call selfClaimQuickFix and returns its result', async () => {
    const sb = makeSb({});
    const selfClaimQuickFix = vi.fn(async () => ({ action: 'self_claimed_qf', qf: 'QF-OK-001' }));
    const ctx = { sb, sessionId: SESSION_ID, sessionMetadata: {}, base: {}, helpers: { selfClaimQuickFix } };
    const result = await selfClaimQf.run(ctx);
    expect(selfClaimQuickFix).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ action: 'self_claimed_qf', qf: 'QF-OK-001' });
  });
});
