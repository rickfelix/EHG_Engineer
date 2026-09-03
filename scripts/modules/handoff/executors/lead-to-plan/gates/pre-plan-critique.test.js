/**
 * Unit tests for the promoted (verdict-bearing) Pre-PLAN Adversarial Critique Gate
 * SD-LEO-INFRA-SYSTEMATIZE-COMPLETENESS-CRITIC-001 (FR-1, FR-3, FR-4)
 *
 * Mutation both directions:
 *  - the gate BLOCKS on block-severity without an override (it could never block before —
 *    217 persisted critiques, 213 BLOCK, zero blocked handoffs), and
 *  - it still PASSES on clean runs, downgrades on an audited override, and degrades (not
 *    fails, not silently passes) on COULD_NOT_CHECK.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// QF-20260902-181: real computeContentHash/buildCritiqueUserPrompt run unmocked (pure,
// deterministic — the retry guard needs a REAL hash to compare against, not a stub), only
// critiquePlanProposal itself (the LLM call) stays mocked.
vi.mock('../../../../../../lib/eva/devils-advocate.js', async (importOriginal) => ({
  ...(await importOriginal()),
  COULD_NOT_CHECK: 'could_not_check',
  critiquePlanProposal: vi.fn(),
}));

import { critiquePlanProposal, computeContentHash, buildCritiqueUserPrompt } from '../../../../../../lib/eva/devils-advocate.js';
import { getOpenAIModel } from '../../../../../../lib/config/model-config.js';
import { createPrePlanCritiqueGate, validatePrePlanCritique, deriveCombinedSeverity } from './pre-plan-critique.js';

// QF-20260902-181: the exact content_hash validatePrePlanCritique will compute for NEUTRAL_PRD
// (no arch_key on SD -> archContent='', archLoadStatus='not_found') — mirrors the gate's own
// prdSections construction so the retry-guard tests can plant a matching prior "last block" row.
function neutralRetryHash() {
  const prdSections = {
    executive_summary: NEUTRAL_PRD.executive_summary,
    functional_requirements: NEUTRAL_PRD.functional_requirements,
    acceptance_criteria: NEUTRAL_PRD.acceptance_criteria,
    test_scenarios: NEUTRAL_PRD.test_scenarios,
    risks: NEUTRAL_PRD.risks,
    system_architecture: undefined,
    implementation_approach: undefined,
  };
  const { prdRawText, archRawText } = buildCritiqueUserPrompt({ prdContent: prdSections, archContent: '', sdContext: {} });
  return computeContentHash({ prdRawText, archRawText, archLoadStatus: 'not_found', model: getOpenAIModel('validation') });
}

// Neutral PRD content: no invariant-library trigger vocabulary, so only the mocked LLM
// findings drive the verdict unless a test opts in.
const NEUTRAL_PRD = {
  id: 'PRD-TEST-001',
  executive_summary: 'Improve the dashboard widget copy',
  functional_requirements: [{ id: 'FR-1', description: 'Reword the empty-state text' }],
  acceptance_criteria: ['Empty state shows the new copy'],
  test_scenarios: [],
  risks: [],
};

function makeSupabase({ prd = NEUTRAL_PRD, prdError = null, overrideRows = [], insertError = null, overrideError = null } = {}) {
  const inserted = [];
  const client = {
    _inserted: inserted,
    from(table) {
      if (table === 'product_requirements_v2') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: prd, error: prdError }),
            }),
          }),
        };
      }
      if (table === 'plan_critiques') {
        // TR-7: a self-chaining query builder (not a fixed-depth .eq().eq().not()... shape) so
        // findActiveOverride's content_hash filter (a 3rd .eq(), added by FR-4/FR-5) — or any
        // future filter — never breaks this mock's shape again. Fully argument-blind: it returns
        // overrideRows regardless of what was filtered on, matching this file's existing
        // discipline that content_hash-EQUALITY correctness itself belongs to the real-DB
        // integration harness (TS-8/TS-9's own routing note), not this mocked unit suite.
        const chain = {
          eq: () => chain,
          not: () => chain,
          gte: () => chain,
          order: () => chain,
          limit: async () => ({ data: overrideError ? null : overrideRows, error: overrideError }),
        };
        return {
          insert: async (row) => {
            inserted.push(row);
            return { error: insertError };
          },
          select: () => chain,
        };
      }
      if (table === 'eva_architecture_plans') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: null, error: null }) }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };
  return client;
}

const SD = { id: 'sd-uuid-1', sd_key: 'SD-FIXTURE-001', title: 'Fixture', metadata: {} };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('gate promotion (FR-1)', () => {
  it('is verdict-bearing: required=true, weight=1.0', () => {
    const gate = createPrePlanCritiqueGate(makeSupabase());
    expect(gate.name).toBe('PRE_PLAN_ADVERSARIAL_CRITIQUE');
    expect(gate.required).toBe(true);
    expect(gate.weight).toBe(1.0);
  });

  // SD-LEO-INFRA-CRITIQUE-GATE-NON-001: category is 'contradiction' (a HIGH_AUTHORITY_CATEGORIES
  // member), not 'missing_criteria' — a single low-authority finding no longer blocks on its own
  // (see the sufficiency-threshold tests below); this test now proves the gate still blocks on a
  // genuinely decision-authority-worthy single finding.
  it('FAILS on block severity with no override (direction 1: it can now block)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'SD scope contradicts its own title', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.join(' ')).toMatch(/critique-override\.js/);
    // FR-4: the block was persisted BEFORE the verdict returned
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0].overall_severity).toBe('block');
  });

  // SD-LEO-INFRA-CRITIQUE-GATE-NON-001: category 'contradiction' (see note on the preceding test).
  it('DOWNGRADES on an audited override bound to the SAME content_hash — passes with the override cited, findings still persisted (FR-4/FR-5 binding predicate)', async () => {
    const blockFindings = [{ severity: 'block', category: 'contradiction', message: 'SD scope contradicts its own title', location: 'PRD' }];
    critiquePlanProposal.mockResolvedValue({
      findings: blockFindings,
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
      contentHash: 'hash-abc123',
    });
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-1', content_hash: 'hash-abc123', override_reason: 'AC covered by parent SD', override_by: 'chairman', created_at: '2026-08-09T00:00:00Z' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(60);
    expect(result.warnings.join(' ')).toMatch(/audited override.*chairman/);
    expect(supabase._inserted).toHaveLength(1); // downgrade, not silence
    expect(supabase._inserted[0].content_hash).toBe('hash-abc123'); // the block row also persists its own hash
  });

  // FR-4/FR-5, testing-agent T1/T12: content_hash REPLACES findingsFingerprint as the binding
  // predicate — an override is scoped to WHAT WAS REVIEWED (content), not to a specific LLM
  // call's non-deterministic findings composition. This test's mock is argument-blind (it cannot
  // itself enforce that a real content_hash mismatch is filtered out in Postgres — that's the
  // real-DB integration harness's job, TS-8/TS-9), so it asserts the CALLER-SIDE half of the
  // contract instead: the gate calls findActiveOverride with the CURRENT run's own contentHash,
  // never with a stale or borrowed value, and returns no rows when the mock reports none (a
  // real content_hash filter would return none for a genuine mismatch).
  it('an override with no matching content_hash does NOT downgrade — the block stands', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'a NEW, different planning gap', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
      contentHash: 'hash-new-content',
    });
    // overrideRows empty: simulates Postgres's content_hash equality filter finding no match for
    // 'hash-new-content' (a real DB never returns a row whose content_hash differs from the filter).
    const supabase = makeSupabase({ overrideRows: [] });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  // TR-5: a could-not-check block (contentHash never computed — the prompt was never built) must
  // never bind to ANY override, including one that happens to carry content_hash IS NULL in the
  // DB. findActiveOverride's own guard returns null WITHOUT querying when currentContentHash is
  // falsy — this pins that the gate-level verdict reflects that (block stands, not overridden).
  it('a could-not-check block (no computed content_hash) never binds to an override, even one with content_hash NULL', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'invariant-only block, LLM was blind', location: 'PRD' }],
      overall_severity: 'block', // combined can still reach 'block' via invariant escalation
      model_used: null,
      token_usage: null,
      contentHash: null,
    });
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-old', content_hash: null, override_reason: 'stale null-hash override', override_by: 'chairman', created_at: '2026-08-09T00:00:00Z' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  // VALIDATION (PLAN_VERIFICATION evidence, VAL-1, HIGH): a schema-missing error on the OVERRIDE
  // LOOKUP itself (not the insert) must be distinguishable from "no override was ever recorded" —
  // the block still correctly stands (fail-closed), but the gate must say WHY, loudly, matching
  // FR-6's own precedent at persistCritique. Before this fix, `if (error || ...) return null` made
  // this indistinguishable from a genuine absence.
  // SD-LEO-INFRA-CRITIQUE-GATE-NON-001: category 'contradiction' (see note two tests up).
  it('a schema-missing error on the override lookup itself is reported loudly, distinct from "no override recorded"', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'block', category: 'contradiction', message: 'SD scope contradicts its own title', location: 'PRD' }],
      overall_severity: 'block',
      model_used: 'test-model',
      token_usage: null,
      contentHash: 'hash-abc123',
    });
    const supabase = makeSupabase({ overrideError: { code: '42703', message: 'column plan_critiques.content_hash does not exist' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false); // still fail-closed — no override CAN apply
    expect(result.score).toBe(0);
    expect(result.warnings.join(' ')).toMatch(/SCHEMA MISSING on override lookup/);
    expect(result.warnings.join(' ')).toMatch(/NOT evidence that no override was ever recorded/);
  });

  // QF-20260902-181: 23 handoffs in the 7-day cohort retried 4-5x within minutes on unchanged
  // content, each an independent LLM call. The guard refuses re-execute while content_hash
  // matches the last blocking verdict and no override applies — replaying the prior findings
  // without ever calling the LLM, and still persisting a row (never a silent skip).
  // SD-LEO-INFRA-CRITIQUE-GATE-NON-001: category 'contradiction' (see the note on the two
  // "FAILS on block severity" tests above) — a genuinely still-block-worthy prior finding.
  it('refuses re-execute and replays prior findings when content_hash is unchanged since the last block AND it still earns block under current rules, without calling critiquePlanProposal', async () => {
    const priorFindings = [{ severity: 'block', category: 'contradiction', message: 'SD scope contradicts its own title', location: 'PRD' }];
    // override_reason/override_by are '' (not omitted) so the shared blind mock's own
    // findActiveOverride loop correctly reads this row as NOT an override (see makeSupabase's
    // own note on why the loop needs a real empty string, not undefined, to `continue`).
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-prev', content_hash: neutralRetryHash(), findings: priorFindings, metadata: { llm_result: { overall_severity: 'block' } }, model_used: 'gpt-5.4', created_at: '2026-09-01T00:00:00Z', override_reason: '', override_by: '' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(critiquePlanProposal).not.toHaveBeenCalled();
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(result.issues.join(' ')).toMatch(/Re-execute refused.*content_hash unchanged/);
    expect(supabase._inserted).toHaveLength(1);
    // .toEqual, not .toBe: replayFindings is now [...lastLlmFindings, ...invariant.findings] (N2
    // fix — the invariant half re-runs fresh even on replay), a NEW array object even when its
    // content is identical (NEUTRAL_PRD triggers no invariants, so content matches priorFindings).
    expect(supabase._inserted[0].findings).toEqual(priorFindings);
    expect(supabase._inserted[0].metadata.retry_refused).toBe(true);
    expect(supabase._inserted[0].metadata.replayed_from).toBe('crit-prev');
  });

  // TESTING sub-agent prospective finding (MUST-FIX #3): the replay path used to hardcode
  // overall_severity:'block' regardless of what the SAME findings would earn under the current
  // aggregation rules — meaning this SD's own fix could never reach any of the 358 SDs already
  // sitting on an unchanged, previously-blocked PRD. This pins the corrected behavior: content
  // unchanged, prior findings re-derived, no new LLM call, and the SD is no longer stuck forever.
  it('re-derives (not replays as a hardcoded block) a prior block that no longer earns block under current rules — no LLM re-call needed', async () => {
    const priorFindings = [{ severity: 'block', category: 'missing_criteria', message: 'untestable', location: 'PRD' }];
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-prev', content_hash: neutralRetryHash(), findings: priorFindings, metadata: { llm_result: { overall_severity: 'block' } }, model_used: 'gpt-5.4', created_at: '2026-09-01T00:00:00Z', override_reason: '', override_by: '' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(critiquePlanProposal).not.toHaveBeenCalled(); // content unchanged — no LLM re-call
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn, not the stale block
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0].overall_severity).toBe('warn');
    expect(supabase._inserted[0].metadata.retry_refused).toBe(false);
    expect(supabase._inserted[0].metadata.re_derived_from).toBe('crit-prev');
  });

  // TESTING sub-agent re-verification finding N2: the replay branch used to `return` before
  // runInvariantChecks ever ran, so a re-derived PASS on the replay path could reuse a STALE
  // invariant snapshot from the original run — a new invariant added to the library since would
  // never fire on any SD replaying unchanged content. Fixed by moving runInvariantChecks ahead of
  // the replay-guard (it's free — no LLM, no network) and re-merging its FRESH output on replay.
  it('the replay-pass path re-runs invariant checks FRESH, not the stale snapshot from the original blocking row', async () => {
    // PRD text that trips INV-001 (a "gate" with no could-not-run behavior) — same trigger used
    // by "merges deterministic invariant findings with the LLM pass" above.
    const prd = { ...NEUTRAL_PRD, executive_summary: 'Add a new drift monitor and quality gate' };
    const prdSectionsForHash = {
      executive_summary: prd.executive_summary,
      functional_requirements: prd.functional_requirements,
      acceptance_criteria: prd.acceptance_criteria,
      test_scenarios: prd.test_scenarios,
      risks: prd.risks,
      system_architecture: undefined,
      implementation_approach: undefined,
    };
    const { prdRawText, archRawText } = buildCritiqueUserPrompt({ prdContent: prdSectionsForHash, archContent: '', sdContext: {} });
    const gateTriggeringHash = computeContentHash({ prdRawText, archRawText, archLoadStatus: 'not_found', model: getOpenAIModel('validation') });
    // The HISTORICAL row's findings deliberately carry NO invariant finding — simulating a prior
    // run before this invariant existed in the library (or one that simply missed it), which is
    // exactly the shape this fix must not silently perpetuate.
    const priorFindings = [{ severity: 'block', category: 'missing_criteria', message: 'untestable', location: 'PRD' }];
    const supabase = makeSupabase({
      prd,
      overrideRows: [{ id: 'crit-prev', content_hash: gateTriggeringHash, findings: priorFindings, metadata: { llm_result: { overall_severity: 'block', findings: priorFindings } }, model_used: 'gpt-5.4', created_at: '2026-09-01T00:00:00Z', override_reason: '', override_by: '' }],
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(critiquePlanProposal).not.toHaveBeenCalled(); // content unchanged — no LLM re-call
    expect(result.pass).toBe(true);
    expect(supabase._inserted).toHaveLength(1);
    // The freshly-run invariant finding IS present in the replayed/persisted findings, even
    // though it was absent from the historical row being replayed.
    expect(supabase._inserted[0].findings.some((f) => f.invariant_id === 'INV-001-control-without-could-not-check-path')).toBe(true);
  });

  it('does NOT refuse re-execute when an active override exists for the current content_hash, even though the last verdict was block', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    const supabase = makeSupabase({
      overrideRows: [{ id: 'crit-prev', content_hash: neutralRetryHash(), findings: [], model_used: 'gpt-5.4', created_at: '2026-09-01T00:00:00Z', override_reason: 'AC covered by parent SD', override_by: 'chairman' }],
    });
    await validatePrePlanCritique({ sd: SD, supabase });
    expect(critiquePlanProposal).toHaveBeenCalled();
  });

  it('still PASSES clean at 100 (direction 2: promotion did not break the pass path)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(100);
  });
});

// SD-LEO-INFRA-CRITIQUE-GATE-NON-001: golden-corpus negative control.
//
// HARD CONSTRAINT (Solomon, accepted by Adam, carried by the coordinator's review-clear —
// see the SD's own metadata.success_criterion): the success criterion is DISCRIMINATION, never
// the pass rate. "Re-thresholding a never-passing gate until it passes" (i.e. justifying a fix
// by "the pass rate went up") is early-return trigger (iii) of ratification 09f14b64 — criteria
// changed so a number improves without outcome improvement. This suite is written against that
// bar: a KNOWN-GOOD plan must PASS (or degrade to warn, never block), a KNOWN-BAD plan must
// still BLOCK. Neither corpus item was invented to make a percentage move.
//
// KNOWN-GOOD: the real PRD (product_requirements_v2) from SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001
// — an SD from this same session, independently verified clean (VALIDATION + TESTING + SECURITY
// sub-agent evidence, heal score 97/100, retrospective quality 90/100, zero rework). Run LIVE
// through critiquePlanProposal() against the rewritten (decision-authority-anchored) system
// prompt: overall_severity='warn', 4 findings, none category contradiction/missing_rollback.
// Pinned below via its EXACT live findings shape.
//
// KNOWN-BAD: a PRD modeled directly on a REAL, already-cited incident in this same codebase
// (lib/eva/invariant-library.js INV-002's citation: scripts/semantic-indexer.js was unrunnable
// for 289 days while every instrument said the feature existed) — acceptance criteria claiming
// "verified working" while the risk section admits the exact same script has been silently
// failing and is NOT being fixed by this plan. Run LIVE through the same critiquePlanProposal():
// overall_severity='block', with a genuine category='contradiction' finding naming all four
// contradicting sections. Pinned below via its EXACT live findings shape.
//
// (These two live runs are not re-executed by CI — they were run once, by hand, against the
// real LLM, to obtain ground truth; this suite pins the RESULT so the aggregation logic itself
// stays regression-tested deterministically without a live LLM call on every CI run.)
//
// Measured basis (background, NOT the success criterion): 373 live plan_critiques rows
// (2026-04-07..2026-09-03), 0 PASS ever recorded, 358/373 (96%) block; of a 50-row block sample,
// 43 (86%) carried exactly ONE block-severity finding, 49/56 of those (87.5%) category
// 'missing_criteria'. This context explains WHY a fix was needed; it is not what proves the fix
// correct — the live-run discrimination pins above are what prove that.
describe('sufficiency threshold + decision-authority anchoring (SD-LEO-INFRA-CRITIQUE-GATE-NON-001)', () => {
  describe('DISCRIMINATION (the success criterion): real known-good/known-bad live LLM runs, pinned', () => {
    it('KNOWN-GOOD (real SD-LEO-FIX-CHAIRMAN-DECISION-CAPTURE-001 PRD, live critique): combined severity is warn, never block', () => {
      // Exact findings array from a live critiquePlanProposal() run against the real PRD content,
      // using the rewritten decision-authority-anchored system prompt.
      const liveFindings = [
        { severity: 'warn', category: 'missing_criteria', message: 'FR-4/TS-7 workflow_dispatch dry_run input schema not required in acceptance criteria' },
        { severity: 'warn', category: 'missing_criteria', message: 'FR-5 live-database premise (fn_chairman_decide, isFixApplied) has no validation artifact in acceptance criteria' },
        { severity: 'warn', category: 'scope_incoherence', message: 'SD says phases are already shipped while acceptance also requires merge-state verification' },
        { severity: 'note', category: 'reuse_opportunity', message: 'Static-pin tests may be brittle relative to behavioral tests' },
      ];
      expect(deriveCombinedSeverity({ llmOverall: 'warn', findings: liveFindings })).toBe('warn');
    });

    it('KNOWN-BAD (real-incident-shaped contradictory PRD, live critique): combined severity is block', () => {
      // Exact findings array from a live critiquePlanProposal() run against a PRD deliberately
      // modeled on the real INV-002-cited semantic-indexer incident (acceptance criteria
      // contradicting the risk section's own admission of silent, unfixed failure).
      const liveFindings = [
        { severity: 'block', category: 'contradiction', message: 'Acceptance criteria claim embeddings are backfilled and detection restored, but RISKS admits the indexer has been silently failing for months and this SD does not fix it, while IMPLEMENTATION_APPROACH reruns the broken script unmodified' },
        { severity: 'warn', category: 'missing_criteria', message: 'Acceptance criteria do not verify the actual data outcome (row counts), only exit code' },
        { severity: 'warn', category: 'scope_incoherence', message: 'One-time backfill vs recurring schedule is unclear' },
        { severity: 'warn', category: 'missing_criteria', message: "'Duplicate-SD detection is fully operational' has no defined success metric" },
      ];
      expect(deriveCombinedSeverity({ llmOverall: 'block', findings: liveFindings })).toBe('block');
    });

    // TESTING sub-agent prospective finding (should-fix #5): SUFFICIENCY_THRESHOLD=2 had zero
    // live corpus evidence — the known-bad item above blocks via the high-authority (contradiction)
    // path, not via count. This third live run targets the count branch: a plan with FOUR genuine,
    // independent gaps (including a real scope ambiguity: single-venture vs report-aggregate
    // endpoint) and no contradiction/rollback issue. Result under the rewritten prompt:
    // overall_severity='warn' with ZERO block findings — the LLM itself no longer reaches for
    // "block" on a multi-gap-but-resolvable plan. This is HONEST, DOCUMENTED evidence that the
    // count-based sufficiency branch is a rarely-triggered defense-in-depth backstop (for cases
    // where the LLM violates its own block-category instruction), not something the live prompt
    // fix depends on to achieve real-world discrimination — the prompt rewrite alone is doing most
    // of the work. The count branch's own correctness is still covered by the synthetic
    // deriveCombinedSeverity unit tests above ("TWO independent low-authority block findings still
    // block"), which construct the violation scenario directly since a compliant LLM won't.
    it('a plan with FOUR genuine independent gaps (no contradiction) stays warn under the live rewritten prompt — the count-sufficiency branch is a backstop, not the primary mechanism', () => {
      const liveFindings = [
        { severity: 'warn', category: 'missing_criteria', message: 'No auth/access-control requirement for a stated "public API endpoint"' },
        { severity: 'warn', category: 'scope_incoherence', message: 'Per-venture id vs report-aggregate endpoint is unclear' },
        { severity: 'warn', category: 'missing_criteria', message: 'No acceptance criteria for cache TTL/staleness behavior' },
        { severity: 'warn', category: 'missing_criteria', message: 'No error-path (400/404/5xx) acceptance criteria' },
        { severity: 'note', category: 'reuse_opportunity', message: 'Route does not reuse existing report metric-calculation logic' },
      ];
      expect(deriveCombinedSeverity({ llmOverall: 'warn', findings: liveFindings })).toBe('warn');
    });
  });


  describe('deriveCombinedSeverity — pure aggregation core', () => {
    it('a single low-authority (missing_criteria) block finding downgrades to warn — the measured 86% real-world case', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [{ severity: 'block', category: 'missing_criteria', message: 'x' }],
      });
      expect(combined).toBe('warn');
    });

    it('a single low-authority (scope_incoherence) block finding also downgrades — the rule is category-based, not name-specific to missing_criteria', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [{ severity: 'block', category: 'scope_incoherence', message: 'x' }],
      });
      expect(combined).toBe('warn');
    });

    it('TWO independent low-authority block findings still block — sufficiency via count', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [
          { severity: 'block', category: 'missing_criteria', message: 'x' },
          { severity: 'block', category: 'missing_criteria', message: 'y' },
        ],
      });
      expect(combined).toBe('block');
    });

    it('a single contradiction finding blocks on its own — sufficiency via decision-authority category', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [{ severity: 'block', category: 'contradiction', message: 'x' }],
      });
      expect(combined).toBe('block');
    });

    it('a single missing_rollback finding blocks on its own — the other decision-authority category', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [{ severity: 'block', category: 'missing_rollback', message: 'x' }],
      });
      expect(combined).toBe('block');
    });

    it('a block verdict with EMPTY findings is untouched by the downgrade — preserves the PR #6927 anti-laundering fix', () => {
      const combined = deriveCombinedSeverity({ llmOverall: 'block', findings: [] });
      expect(combined).toBe('block');
    });

    it('a block seed with findings present but none of them block-severity stays block (seed-never-lowers residual case)', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [{ severity: 'warn', category: 'missing_criteria', message: 'x' }],
      });
      expect(combined).toBe('block');
    });

    it('mixed severities with an insufficient solo block finding: combined caps at warn, does not fall further to note/pass', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [
          { severity: 'block', category: 'missing_criteria', message: 'x' },
          { severity: 'note', category: 'reuse_opportunity', message: 'y' },
        ],
      });
      expect(combined).toBe('warn');
    });

    it('a high-authority block finding co-occurring with unrelated notes still blocks', () => {
      const combined = deriveCombinedSeverity({
        llmOverall: 'block',
        findings: [
          { severity: 'block', category: 'contradiction', message: 'x' },
          { severity: 'note', category: 'reuse_opportunity', message: 'y' },
        ],
      });
      expect(combined).toBe('block');
    });

    it('no findings, llmOverall pass: stays pass (baseline, unaffected)', () => {
      expect(deriveCombinedSeverity({ llmOverall: 'pass', findings: [] })).toBe('pass');
    });

    // TESTING sub-agent re-verification finding N1 (mutation testing): the tests above only ever
    // used the four "recognized" categories on well-formed findings — a revert of the
    // LOW_AUTHORITY denylist back to a HIGH_AUTHORITY allowlist (reopening MUST-FIX #1/#2)
    // survived 37/37 with zero failures. These pin the fail-closed edge cases directly so that
    // specific regression can never again ship silently green.
    describe('fail-closed edge cases (mutation-testing follow-up, kills the fail-open revert)', () => {
      it('category "invariant" (a deterministic, proof-carrying finding) on a solo block finding stays block, never silently downgraded', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [{ severity: 'block', category: 'invariant', invariant_id: 'INV-999-hypothetical', message: 'x' }],
        });
        expect(combined).toBe('block');
      });

      it('category "other" on a solo block finding stays block — the prompt now forbids "other" for block, so an LLM that violates it is treated conservatively, not silently discarded', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [{ severity: 'block', category: 'other', message: 'x' }],
        });
        expect(combined).toBe('block');
      });

      it('missing/null/non-string category on a solo block finding stays block (fail-closed, never fails open on malformed data)', () => {
        for (const category of [null, undefined, 42, {}, false]) {
          const combined = deriveCombinedSeverity({
            llmOverall: 'block',
            findings: [{ severity: 'block', category, message: 'x' }],
          });
          expect(combined).toBe('block');
        }
      });

      it('whitespace/case variance on a genuinely low-authority category still downgrades ("  Missing_Criteria  " matches "missing_criteria")', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [{ severity: 'block', category: '  Missing_Criteria  ', message: 'x' }],
        });
        expect(combined).toBe('warn');
      });

      it('whitespace/case variance on a high-stakes category still blocks ("  Contradiction  " matches "contradiction", is NOT in the low-authority set)', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [{ severity: 'block', category: '  Contradiction  ', message: 'x' }],
        });
        expect(combined).toBe('block');
      });

      it('a mix of one low-authority and one unrecognized-category block finding stays block — every() requires ALL block findings to be low-authority, not just any', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [
            { severity: 'block', category: 'missing_criteria', message: 'x' },
            { severity: 'block', category: 'other', message: 'y' },
          ],
        });
        expect(combined).toBe('block');
      });

      it('duplicate (byte-identical) low-authority block findings do NOT satisfy the sufficiency count — dedup prevents the LLM manufacturing sufficiency by restating the same gap', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [
            { severity: 'block', category: 'missing_criteria', message: 'AC-3 is underspecified' },
            { severity: 'block', category: 'missing_criteria', message: 'AC-3 is underspecified' },
          ],
        });
        expect(combined).toBe('warn'); // still just ONE distinct finding after dedup
      });

      it('two genuinely DISTINCT low-authority findings (different message) still satisfy sufficiency and block', () => {
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [
            { severity: 'block', category: 'missing_criteria', message: 'AC-3 is underspecified' },
            { severity: 'block', category: 'missing_criteria', message: 'AC-5 is missing entirely' },
          ],
        });
        expect(combined).toBe('block');
      });

      it('malformed findings elements (null, a bare string, a number) are silently skipped, never throw', () => {
        expect(() => deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [null, 'not-an-object', 7, { severity: 'block', category: 'missing_criteria', message: 'x' }],
        })).not.toThrow();
        const combined = deriveCombinedSeverity({
          llmOverall: 'block',
          findings: [null, 'not-an-object', 7, { severity: 'block', category: 'missing_criteria', message: 'x' }],
        });
        expect(combined).toBe('warn'); // the one well-formed finding still processes correctly
      });

      it('a non-array findings argument (null/undefined) is treated as empty, never throws', () => {
        expect(deriveCombinedSeverity({ llmOverall: 'block', findings: null })).toBe('block'); // empty findings, PR #6927 rule
        expect(deriveCombinedSeverity({ llmOverall: 'pass', findings: undefined })).toBe('pass');
      });
    });
  });

  describe('end-to-end through validatePrePlanCritique — the exact measured real-world dominant case', () => {
    it('a single missing_criteria block finding now PASSES DEGRADED as warn (score 75), not block (score 0)', async () => {
      critiquePlanProposal.mockResolvedValue({
        findings: [{ severity: 'block', category: 'missing_criteria', message: 'AC-3 is underspecified', location: 'PRD' }],
        overall_severity: 'block',
        model_used: 'test-model',
        token_usage: null,
      });
      const supabase = makeSupabase();
      const result = await validatePrePlanCritique({ sd: SD, supabase });
      expect(result.pass).toBe(true);
      expect(result.score).toBe(75);
      // still persisted at its true derived severity, never silently discarded
      expect(supabase._inserted).toHaveLength(1);
      expect(supabase._inserted[0].overall_severity).toBe('warn');
    });

    it('two missing_criteria block findings still FAILS at block (score 0) — sufficiency via count end-to-end', async () => {
      critiquePlanProposal.mockResolvedValue({
        findings: [
          { severity: 'block', category: 'missing_criteria', message: 'AC-3 is underspecified', location: 'PRD' },
          { severity: 'block', category: 'missing_criteria', message: 'AC-5 is missing entirely', location: 'PRD' },
        ],
        overall_severity: 'block',
        model_used: 'test-model',
        token_usage: null,
      });
      const supabase = makeSupabase();
      const result = await validatePrePlanCritique({ sd: SD, supabase });
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });
});

describe('coverage, never completeness (FR-3)', () => {
  it('reports which invariant classes were checked and never claims completeness', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase: makeSupabase() });
    const coverage = result.warnings.find((w) => w.startsWith('COVERAGE:'));
    expect(coverage).toBeTruthy();
    expect(coverage).toMatch(/INV-001/);
    expect(coverage).toMatch(/No claim of completeness|require tier-2\/human review/);
  });

  it('merges deterministic invariant findings with the LLM pass', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
    });
    // PRD text that trips INV-001: introduces a "gate" with no could-not-run behavior.
    const prd = { ...NEUTRAL_PRD, executive_summary: 'Add a new drift monitor and quality gate' };
    const supabase = makeSupabase({ prd });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn from the invariant, despite LLM pass
    expect(supabase._inserted[0].findings.some((f) => f.invariant_id === 'INV-001-control-without-could-not-check-path')).toBe(true);
    // TESTING (EXEC-phase evidence, HIGH finding #2): metadata.llm_result is the RAW pre-merge
    // LLM output — it must NOT carry the invariant finding that only entered the top-level,
    // COMBINED findings column above. A future cache hit reads llm_result and lets
    // validatePrePlanCritique freshly re-merge invariant findings on its own next run; if
    // llm_result already contained the merge, that re-merge would duplicate it.
    expect(supabase._inserted[0].metadata.llm_result).toEqual({ findings: [], overall_severity: 'pass' });
  });

  // VALIDATION (PLAN_VERIFICATION evidence, VAL-4): FR-1 AC-4 requires a persisted
  // metadata.truncated row, not just critiquePlanProposal's own return value — the gate-level
  // WRITE was previously unasserted.
  it('persists metadata.truncated with literal booleans and side-qualified counts (FR-1 AC-4)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
      truncated: {
        prd: { truncated: true, charsRead: 60000, charsTotal: 70000 },
        arch: { truncated: false, charsRead: 500, charsTotal: 500 },
      },
    });
    const supabase = makeSupabase();
    await validatePrePlanCritique({ sd: SD, supabase });
    expect(supabase._inserted[0].metadata.truncated).toEqual({
      prd: true, arch: false, shownPrd: 60000, totalPrd: 70000, shownArch: 500, totalArch: 500,
    });
  });

  // VALIDATION (PLAN_VERIFICATION evidence, VAL-4): FR-4 AC-5 requires a cache-hit row to persist
  // metadata.cache_hit=true + cache_source_id — likewise only asserted at the return-value level
  // before this test, never at the gate's actual INSERT payload.
  it('persists metadata.cache_hit and cache_source_id when the critique was a cache hit (FR-4 AC-5)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null,
      cacheHit: true, cacheSourceId: 'cached-row-xyz',
    });
    const supabase = makeSupabase();
    await validatePrePlanCritique({ sd: SD, supabase });
    expect(supabase._inserted[0].metadata.cache_hit).toBe(true);
    expect(supabase._inserted[0].metadata.cache_source_id).toBe('cached-row-xyz');
  });
});

describe('could-not-check honesty (FR-3/FR-4)', () => {
  it('passes DEGRADED (50) when the LLM could not run and invariants found nothing — and persists the blindness', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'OPENAI_API_KEY not configured',
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50); // never a silent 100
    expect(result.warnings.join(' ')).toMatch(/COULD_NOT_CHECK/);
    // FR-4: the blindness itself is persisted (the old code returned before persisting)
    expect(supabase._inserted).toHaveLength(1);
    expect(supabase._inserted[0].overall_severity).toBe('could_not_check');
  });

  it('invariant findings still bear the verdict when the LLM is blind', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'LLM timeout',
    });
    const prd = { ...NEUTRAL_PRD, executive_summary: 'Add a new drift monitor and quality gate' };
    const supabase = makeSupabase({ prd });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn finding outranks the blindness
    expect(supabase._inserted[0].overall_severity).toBe('warn');
  });

  it('reports a CHECK constraint violation loudly, distinct from a generic insert failure (23514)', async () => {
    // The 20260810 migration widening this constraint to permit could_not_check is confirmed live
    // (verified 2026-08-16) — the old could_not_check-specific "KNOWN LIMITATION" framing (TR-4)
    // is stale and removed. This pins the current, general behavior: ANY 23514 gets its own named
    // branch, distinct from the generic 'plan_critiques insert failed' message.
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'could_not_check', model_used: null, token_usage: null,
      fallback_reason: 'LLM timeout',
    });
    const supabase = makeSupabase({ insertError: { code: '23514', message: 'violates check constraint' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50);
    expect(result.warnings.join(' ')).toMatch(/CHECK constraint violation/);
    expect(result.warnings.join(' ')).toMatch(/NOT persisted/);
  });

  it('reports a SCHEMA MISSING error loudly, distinct from a generic insert failure (FR-6: PGRST204/42703)', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'pass', model_used: 'test-model', token_usage: null, truncated: null,
    });
    const supabase = makeSupabase({ insertError: { code: 'PGRST204', message: "Could not find the 'content_hash' column of 'plan_critiques' in the schema cache" } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/SCHEMA MISSING/);
    expect(result.warnings.join(' ')).toMatch(/shipped ahead of its migration/);
    expect(result.warnings.join(' ')).not.toMatch(/plan_critiques insert failed:/);
  });
});

describe('verdict cannot be laundered through findings shape (adversarial review, PR #6927)', () => {
  it('FAILS when the LLM says block with EMPTY findings — the verdict seeds combined severity', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [], overall_severity: 'block', model_used: 'test-model', token_usage: null,
    });
    const supabase = makeSupabase();
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
    expect(supabase._inserted[0].overall_severity).toBe('block'); // never persisted as 'pass'
  });

  it('off-vocabulary finding severities rank as warn, never below pass', async () => {
    critiquePlanProposal.mockResolvedValue({
      findings: [{ severity: 'critical', category: 'contradiction', message: 'x', location: 'PRD' }],
      overall_severity: 'pass', // LLM aggregation also broken
      model_used: 'test-model', token_usage: null,
    });
    const result = await validatePrePlanCritique({ sd: SD, supabase: makeSupabase() });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(75); // warn, not a silent 100
  });
});

describe('PRD read failure is could-not-check, not absence (adversarial review, PR #6927)', () => {
  it('degrades to score 50 on a non-PGRST116 read error', async () => {
    const supabase = makeSupabase({ prd: null, prdError: { code: '57014', message: 'statement timeout' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.score).toBe(50);
    expect(result.warnings.join(' ')).toMatch(/COULD_NOT_CHECK/);
    expect(critiquePlanProposal).not.toHaveBeenCalled();
  });
});

describe('not-applicable is neither clean nor blind', () => {
  it('passes with NOT_APPLICABLE when no PRD exists yet (normal for a fresh SD at LEAD-TO-PLAN)', async () => {
    const supabase = makeSupabase({ prd: null, prdError: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
    const result = await validatePrePlanCritique({ sd: SD, supabase });
    expect(result.pass).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/NOT_APPLICABLE/);
    expect(supabase._inserted).toHaveLength(0);
    expect(critiquePlanProposal).not.toHaveBeenCalled();
  });
});
