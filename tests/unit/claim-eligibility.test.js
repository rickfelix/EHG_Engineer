// Tests for SD-LEO-FIX-COORDINATOR-SWEEP-CLAIMED-001
// lib/fleet/claim-eligibility.cjs — the SHARED dispatch-eligibility predicate used by BOTH
// worker-checkin.cjs (self_claim) and stale-session-sweep.cjs (CLAIM_FIX). Proves: orchestrator
// parents + dep-blocked SDs are ineligible; leaf drafts with satisfied deps are eligible; the
// tri-state error semantics differ correctly (boolean wrapper = false-on-error for worker parity;
// evaluateDispatchEligibility THROWS so CLAIM_FIX can no-op instead of clearing a legit claim).

import { describe, it, expect } from 'vitest';

const { draftDepsSatisfied, evaluateDispatchEligibility, baselinedCandidateEligible } = require('../../lib/fleet/claim-eligibility.cjs');

// Minimal supabase stub supporting both query chains the predicate uses:
//   .from(t).select(c).eq('sd_key', k).maybeSingle()  -> { data, error }
//   .from(t).select(c).in('sd_key', arr)              -> { data, error }
function makeSb(sdRows, opts = {}) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  if (opts.errorOnSingle) return { data: null, error: { message: 'single boom' } };
                  return { data: null, error: null }; // unused path in these tests (eq+maybeSingle handled via _key below)
                },
              };
            },
            in: async (_col, arr) => {
              if (opts.errorOnIn) return { data: null, error: { message: 'deps boom' } };
              const data = arr.map((k) => (sdRows[k] ? { sd_key: k, status: sdRows[k].status } : null)).filter(Boolean);
              return { data, error: null };
            },
          };
        },
      };
    },
  };
}

// evaluateDispatchEligibility uses .eq('sd_key', sdKey).maybeSingle(); give the stub the key.
function makeSbForEligibility(sdRows, opts = {}) {
  return {
    from() {
      return {
        select() {
          return {
            eq(_col, val) {
              return {
                maybeSingle: async () => {
                  if (opts.errorOnSingle) return { data: null, error: { message: 'single boom' } };
                  const row = sdRows[val];
                  return { data: row ? { sd_type: row.sd_type, dependencies: row.dependencies || [], metadata: row.metadata || {}, status: row.status } : null, error: null };
                },
              };
            },
            in: async (_col, arr) => {
              if (opts.errorOnIn) return { data: null, error: { message: 'deps boom' } };
              const data = arr.map((k) => (sdRows[k] ? { sd_key: k, status: sdRows[k].status } : null)).filter(Boolean);
              return { data, error: null };
            },
          };
        },
      };
    },
  };
}

describe('draftDepsSatisfied', () => {
  it('true when there are no dependencies', async () => {
    expect(await draftDepsSatisfied(makeSb({}), { dependencies: [] })).toBe(true);
  });
  it('true when every referenced dep is completed (object + string shapes)', async () => {
    const sb = makeSb({ 'SD-A': { status: 'completed' }, 'SD-B': { status: 'completed' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [{ sd_key: 'SD-A' }, 'SD-B needs prep'] })).toBe(true);
  });
  it('false when a referenced dep is not completed', async () => {
    const sb = makeSb({ 'SD-A': { status: 'in_progress' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [{ sd_id: 'SD-A' }] })).toBe(false);
  });
  it('treats the "none" sentinel and ref-less notes as non-blocking', async () => {
    expect(await draftDepsSatisfied(makeSb({}), { dependencies: [{ sd_key: 'none' }, { type: 'note' }] })).toBe(true);
  });
  it('default: returns false on a deps-query error (worker-checkin conservative skip)', async () => {
    const sb = makeSb({}, { errorOnIn: true });
    expect(await draftDepsSatisfied(sb, { dependencies: [{ sd_key: 'SD-A' }] })).toBe(false);
  });
  it('throwOnError:true: rethrows the deps-query error (sweep tri-state)', async () => {
    const sb = makeSb({}, { errorOnIn: true });
    await expect(draftDepsSatisfied(sb, { dependencies: [{ sd_key: 'SD-A' }] }, { throwOnError: true })).rejects.toBeTruthy();
  });
});

describe('evaluateDispatchEligibility (discriminated verdict; throws on query error)', () => {
  it('orchestrator parent -> ineligible(orchestrator_parent)', async () => {
    const sb = makeSbForEligibility({ 'SD-ORCH-001': { sd_type: 'orchestrator', dependencies: [] } });
    expect(await evaluateDispatchEligibility(sb, 'SD-ORCH-001')).toEqual({ eligible: false, reason: 'orchestrator_parent' });
  });
  it('dep-blocked leaf -> ineligible(dep_blocked)', async () => {
    const sb = makeSbForEligibility({ 'SD-CHILD-001': { sd_type: 'bugfix', dependencies: [{ sd_key: 'SD-DEP' }] }, 'SD-DEP': { status: 'in_progress' } });
    expect(await evaluateDispatchEligibility(sb, 'SD-CHILD-001')).toEqual({ eligible: false, reason: 'dep_blocked' });
  });
  it('leaf with satisfied deps -> eligible', async () => {
    const sb = makeSbForEligibility({ 'SD-OK-001': { sd_type: 'bugfix', dependencies: [{ sd_key: 'SD-DEP' }] }, 'SD-DEP': { status: 'completed' } });
    expect(await evaluateDispatchEligibility(sb, 'SD-OK-001')).toEqual({ eligible: true });
  });
  it('leaf with no deps -> eligible', async () => {
    const sb = makeSbForEligibility({ 'SD-OK-002': { sd_type: 'feature', dependencies: [] } });
    expect(await evaluateDispatchEligibility(sb, 'SD-OK-002')).toEqual({ eligible: true });
  });
  it('not-found -> ineligible(sd_not_found)', async () => {
    expect(await evaluateDispatchEligibility(makeSbForEligibility({}), 'SD-GONE')).toEqual({ eligible: false, reason: 'sd_not_found' });
  });
  it('lookup error -> THROWS (so CLAIM_FIX can no-op rather than clear a legit claim)', async () => {
    const sb = makeSbForEligibility({}, { errorOnSingle: true });
    await expect(evaluateDispatchEligibility(sb, 'SD-X')).rejects.toBeTruthy();
  });
});

describe('baselinedCandidateEligible (boolean wrapper; false-on-error = worker-checkin parity)', () => {
  it('orchestrator parent -> false', async () => {
    const sb = makeSbForEligibility({ 'SD-ORCH-001': { sd_type: 'orchestrator', dependencies: [] } });
    expect(await baselinedCandidateEligible(sb, 'SD-ORCH-001')).toBe(false);
  });
  it('dep-blocked -> false', async () => {
    const sb = makeSbForEligibility({ 'SD-C': { sd_type: 'bugfix', dependencies: [{ sd_key: 'SD-DEP' }] }, 'SD-DEP': { status: 'draft' } });
    expect(await baselinedCandidateEligible(sb, 'SD-C')).toBe(false);
  });
  it('leaf with deps satisfied -> true', async () => {
    const sb = makeSbForEligibility({ 'SD-OK': { sd_type: 'bugfix', dependencies: [] } });
    expect(await baselinedCandidateEligible(sb, 'SD-OK')).toBe(true);
  });
  it('not-found -> false', async () => {
    expect(await baselinedCandidateEligible(makeSbForEligibility({}), 'SD-GONE')).toBe(false);
  });
  it('lookup error -> false (conservative skip, NOT a throw)', async () => {
    const sb = makeSbForEligibility({}, { errorOnSingle: true });
    expect(await baselinedCandidateEligible(sb, 'SD-X')).toBe(false);
  });
  it('deps-query error -> false (conservative skip)', async () => {
    const sb = makeSbForEligibility({ 'SD-C': { sd_type: 'bugfix', dependencies: [{ sd_key: 'SD-DEP' }] } }, { errorOnIn: true });
    expect(await baselinedCandidateEligible(sb, 'SD-C')).toBe(false);
  });
});

// SD-LEO-INFRA-CO-AUTHOR-CONVERGE-BEFORE-CLAIMABLE-001: a co-authored DRAFT SD is NON-CLAIMABLE until
// co-author convergence (metadata.co_author_pending===true), so a parked worker can't claim it and
// write the PRD before the co-author input lands. Flips to claimable when co_author_pending=false.
describe('co_author_pending gate (SD-LEO-INFRA-CO-AUTHOR-CONVERGE-BEFORE-CLAIMABLE-001)', () => {
  it('co_author_pending:true -> ineligible(co_author_pending)', async () => {
    const sb = makeSbForEligibility({ 'SD-COAUTH-001': { sd_type: 'feature', dependencies: [], metadata: { co_author_pending: true } } });
    expect(await evaluateDispatchEligibility(sb, 'SD-COAUTH-001')).toEqual({ eligible: false, reason: 'co_author_pending' });
  });
  it('co_author_pending:false (converged) -> eligible', async () => {
    const sb = makeSbForEligibility({ 'SD-COAUTH-DONE': { sd_type: 'feature', dependencies: [], metadata: { co_author_pending: false } } });
    expect(await evaluateDispatchEligibility(sb, 'SD-COAUTH-DONE')).toEqual({ eligible: true });
  });
  it('co_author_pending absent (non-co-author DRAFT) -> eligible (no coercion / no regression)', async () => {
    const sb = makeSbForEligibility({ 'SD-PLAIN': { sd_type: 'bugfix', dependencies: [] } });
    expect(await evaluateDispatchEligibility(sb, 'SD-PLAIN')).toEqual({ eligible: true });
  });
  it('a stray truthy (non-true) value does NOT enroll the SD — strict === true only', async () => {
    const sb = makeSbForEligibility({ 'SD-STRAY': { sd_type: 'feature', dependencies: [], metadata: { co_author_pending: 'yes' } } });
    expect(await evaluateDispatchEligibility(sb, 'SD-STRAY')).toEqual({ eligible: true });
  });
  it('baselinedCandidateEligible: co_author_pending:true -> false (self-claim baselined path excludes it)', async () => {
    const sb = makeSbForEligibility({ 'SD-COAUTH-002': { sd_type: 'feature', dependencies: [], metadata: { co_author_pending: true } } });
    expect(await baselinedCandidateEligible(sb, 'SD-COAUTH-002')).toBe(false);
  });
});
