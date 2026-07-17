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
            // draftDepsSatisfied now resolves via .or(sd_key.in.(...),id.in.(...)) so uuid refs match too.
            or: async (filter) => {
              if (opts.errorOnIn) return { data: null, error: { message: 'deps boom' } };
              const keys = [...new Set([...filter.matchAll(/"([^"]+)"/g)].map((m) => m[1]))];
              const data = keys.map((k) => (sdRows[k] ? { id: sdRows[k].id ?? k, sd_key: sdRows[k].sd_key ?? k, status: sdRows[k].status } : null)).filter(Boolean);
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
            or: async (filter) => {
              if (opts.errorOnIn) return { data: null, error: { message: 'deps boom' } };
              const keys = [...new Set([...filter.matchAll(/"([^"]+)"/g)].map((m) => m[1]))];
              const data = keys.map((k) => (sdRows[k] ? { id: sdRows[k].id ?? k, sd_key: sdRows[k].sd_key ?? k, status: sdRows[k].status } : null)).filter(Boolean);
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

  // QF-20260706-786: metadata.blocked_on_sd re-derived from LIVE status, independent of
  // requires_human_action / blocked_on_sd_resolved (live incident: Bravo self-cleared the
  // rha fence on LANDING-REBUILD-001 without the referenced SD having actually completed).
  it('false when metadata.blocked_on_sd references a not-yet-completed SD, even with requires_human_action already cleared', async () => {
    const sb = makeSb({ 'SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001': { status: 'in_progress' } });
    const sd = { dependencies: [], metadata: { requires_human_action: false, blocked_on_sd: 'SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(false);
  });
  it('true once the metadata.blocked_on_sd referenced SD is actually completed', async () => {
    const sb = makeSb({ 'SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001': { status: 'completed' } });
    const sd = { dependencies: [], metadata: { blocked_on_sd: 'SD-LEO-INFRA-FABLE-VENTURE-DESIGN-001' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(true);
  });
  it('treats metadata.blocked_on_sd="none" as non-blocking', async () => {
    const sd = { dependencies: [], metadata: { blocked_on_sd: 'none' } };
    expect(await draftDepsSatisfied(makeSb({}), sd)).toBe(true);
  });

  // Adversarial-review round-1 pins: uuid refs resolve via the id column (parity with the
  // claim gate's dual-column resolution — no more checkin-vs-sweep claim ping-pong), and
  // a non-SD-shaped blocked_by_sd_key stamp never becomes a dangling hard blocker.
  it('uuid-shaped ref to a COMPLETED SD is satisfied (resolved via id column)', async () => {
    const uuid = '15491075-873d-4d38-808b-23fe9c8aa893';
    const sb = makeSb({ [uuid]: { id: uuid, sd_key: 'SD-REAL-001', status: 'completed' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [{ sd_id: uuid }] })).toBe(true);
  });
  it('uuid-shaped ref to a non-completed SD still blocks', async () => {
    const uuid = '15491075-873d-4d38-808b-23fe9c8aa893';
    const sb = makeSb({ [uuid]: { id: uuid, sd_key: 'SD-REAL-001', status: 'in_progress' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [{ sd_id: uuid }] })).toBe(false);
  });
  it('non-SD-shaped metadata.blocked_by_sd_key ("N/A") does not block (canonical shape guard)', async () => {
    const sd = { dependencies: [], metadata: { blocked_by_sd_key: 'N/A' } };
    expect(await draftDepsSatisfied(makeSb({}), sd)).toBe(true);
  });

  // SD-LEO-INFRA-BELT-CLAIM-ELIGIBILITY-001 (FR-2): metadata.soft_depends_on (single key or array)
  // folded into the same live-status re-check, fail-open on absence.
  it('false when metadata.soft_depends_on (string) references a not-yet-completed SD', async () => {
    const sb = makeSb({ 'SD-GOVERNOR-D8-001': { status: 'in_progress' } });
    const sd = { dependencies: [], metadata: { soft_depends_on: 'SD-GOVERNOR-D8-001' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(false);
  });
  it('true once the metadata.soft_depends_on (string) referenced SD is completed', async () => {
    const sb = makeSb({ 'SD-GOVERNOR-D8-001': { status: 'completed' } });
    const sd = { dependencies: [], metadata: { soft_depends_on: 'SD-GOVERNOR-D8-001' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(true);
  });
  // Live example (SD-LEO-INFRA-UNIVERSAL-LOOP-GOVERNANCE-001): Adam stamps soft_depends_on as
  // free-form prose, not a bare key -- the referenced key must be extracted from the sentence.
  it('extracts the referenced key from free-form prose (the live Adam-authored shape)', async () => {
    const sb = makeSb({ 'SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001': { status: 'completed' } });
    const sd = { dependencies: [], metadata: { soft_depends_on: 'D8 (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001) provides merge-time enrollment; can build in parallel, integrate at PLAN' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(true);
  });
  it('false when the prose-embedded referenced SD is not yet completed', async () => {
    const sb = makeSb({ 'SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001': { status: 'in_progress' } });
    const sd = { dependencies: [], metadata: { soft_depends_on: 'D8 (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001) provides merge-time enrollment' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(false);
  });
  it('false when metadata.soft_depends_on (array) has any not-yet-completed target', async () => {
    const sb = makeSb({ 'SD-TEST-A-001': { status: 'completed' }, 'SD-TEST-B-001': { status: 'in_progress' } });
    const sd = { dependencies: [], metadata: { soft_depends_on: ['SD-TEST-A-001', 'SD-TEST-B-001'] } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(false);
  });
  it('true once every metadata.soft_depends_on (array) target is completed', async () => {
    const sb = makeSb({ 'SD-TEST-A-001': { status: 'completed' }, 'SD-TEST-B-001': { status: 'completed' } });
    const sd = { dependencies: [], metadata: { soft_depends_on: ['SD-TEST-A-001', 'SD-TEST-B-001'] } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(true);
  });
  it('treats metadata.soft_depends_on="none", [], and absence as non-blocking (fail-open)', async () => {
    expect(await draftDepsSatisfied(makeSb({}), { dependencies: [], metadata: { soft_depends_on: 'none' } })).toBe(true);
    expect(await draftDepsSatisfied(makeSb({}), { dependencies: [], metadata: { soft_depends_on: [] } })).toBe(true);
    expect(await draftDepsSatisfied(makeSb({}), { dependencies: [], metadata: {} })).toBe(true);
    expect(await draftDepsSatisfied(makeSb({}), { dependencies: [] })).toBe(true);
  });
});

// ── ADDITIVE — SD-LEO-INFRA-MAKE-WSJF-SELF-001 FR-1/FR-4b: draftDepsSatisfied now delegates
// to the SHARED superset extractor (lib/utils/parse-sd-dependencies.cjs extractAllDependencyRefs),
// folding metadata.dependencies / metadata.depends_on / metadata.blocked_by_sd_key too. ──
describe('draftDepsSatisfied — FR-1 superset metadata sources (SD-LEO-INFRA-MAKE-WSJF-SELF-001)', () => {
  it('false when metadata.dependencies references a not-yet-completed SD', async () => {
    const sb = makeSb({ 'SD-MD-001': { status: 'in_progress' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [], metadata: { dependencies: [{ sd_key: 'SD-MD-001' }] } })).toBe(false);
  });
  it('false when metadata.depends_on references a not-yet-completed SD', async () => {
    const sb = makeSb({ 'SD-DO-001': { status: 'draft' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [], metadata: { depends_on: 'SD-DO-001' } })).toBe(false);
  });
  it('false when metadata.blocked_by_sd_key references a not-yet-completed SD', async () => {
    const sb = makeSb({ 'SD-BB-001': { status: 'active' } });
    expect(await draftDepsSatisfied(sb, { dependencies: [], metadata: { blocked_by_sd_key: 'SD-BB-001' } })).toBe(false);
  });
  it('true once every metadata-source target is completed', async () => {
    const sb = makeSb({ 'SD-MD-001': { status: 'completed' }, 'SD-DO-001': { status: 'completed' }, 'SD-BB-001': { status: 'completed' } });
    const sd = { dependencies: [], metadata: { dependencies: [{ sd_key: 'SD-MD-001' }], depends_on: 'SD-DO-001', blocked_by_sd_key: 'SD-BB-001' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(true);
  });
  it('none-sentinels in the metadata sources stay non-blocking', async () => {
    const sd = { dependencies: [], metadata: { dependencies: [{ sd_key: 'none' }], depends_on: 'none', blocked_by_sd_key: 'none' } };
    expect(await draftDepsSatisfied(makeSb({}), sd)).toBe(true);
  });
  it('a SELF-ref via metadata.depends_on evaluates as blocked (false) without throwing', async () => {
    const sb = makeSb({ 'SD-SELF-001': { status: 'draft' } });
    const sd = { sd_key: 'SD-SELF-001', dependencies: [], metadata: { depends_on: 'SD-SELF-001' } };
    expect(await draftDepsSatisfied(sb, sd)).toBe(false);
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
