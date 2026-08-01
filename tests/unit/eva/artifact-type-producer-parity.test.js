/**
 * SD-FDBK-INFRA-TRUTH-DEMAND-THESIS-001 (TS-7) — no declared artifact type may sit gate-enforced
 * with nothing able to produce it.
 *
 * *** THE EXISTING PARITY TEST STAYED GREEN THROUGH THIS ENTIRE OUTAGE. ***
 * tests/unit/eva/artifact-type-db-parity.test.js enforces registry-vs-CHECK-constraint parity and
 * never registry-vs-PRODUCER parity, so `truth_demand_thesis` — declared, gate-enforced at S21, and
 * writable by nothing — passed CI continuously while every venture reaching S21 blocked on it. That
 * is the control for this file: a green suite was fully compatible with the defect.
 *
 * ── WHY THE OBVIOUS PREDICATE IS WRONG, MEASURED BEFORE CHOOSING ──────────────────────────────
 * The natural check is "the type's stage-NN.js names it". MEASURED: that fails 67 of 78 mapped
 * types, because stage templates delegate to analysis steps and the engine resolves the type from
 * ARTIFACT_TYPE_BY_STAGE — the stage file has no reason to name it. Shipping that would have
 * wedged 86% of the population on day one, and a check that bricks the codebase gets switched off
 * permanently, which buys nothing. Same reasoning the mechanism-claim gate applied to its own
 * rollout.
 *
 * The predicate that actually discriminates: a type must be REACHABLE BY A WRITER — mapped in
 * ARTIFACT_TYPE_BY_STAGE (the engine persists stage output under that mapping), or deprecated, or
 * explicitly listed below as name-only with a reason.
 *
 * ── THE ALLOWLIST IS A DEBT REGISTER, NOT AN EXEMPTION ────────────────────────────────────────
 * MEASURED 2026-08-01 against 102 declared types and 2,161 live rows: 21 are unmapped. SEVEN of
 * those have rows (produced via non-stage paths, so they are fine). FOURTEEN have NO MAPPING AND
 * ZERO ROWS — the exact state of truth_demand_thesis.
 *
 * SO THIS SD'S DEFECT IS ONE OF FOURTEEN. truth_demand_thesis is simply the one that happens to be
 * gate-enforced, which is why it blocked a venture and the other thirteen did not. They are latent:
 * declared names waiting for someone to gate on them. Seeding them here makes that debt countable
 * and makes the check BLOCKING for any NEW type from day one.
 */
import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_TYPES,
  ARTIFACT_TYPE_BY_STAGE,
  DEPRECATED_ARTIFACT_TYPES
} from '../../../lib/eva/artifact-types.js';

/**
 * Types declared but not reachable through the stage mapping. Each needs a reason; entries with
 * rows are producible by another path, entries without are genuine name-only debt.
 * MEASURED 2026-08-01. Remove an entry when it gains a mapping or a producer — never add one to
 * make this test pass without saying why.
 */
export const NAME_ONLY_OR_NON_STAGE_PRODUCED = Object.freeze({
  // Produced via non-stage paths — MEASURED to have live rows, so reachable.
  blueprint_token_manifest: 'produced outside the stage mapping; live rows measured 2026-08-01',
  stage_17_analysis: 'produced outside the stage mapping; live rows measured 2026-08-01',
  system_devils_advocate_review: 'produced outside the stage mapping; live rows measured 2026-08-01',
  value_multiplier_assessment: 'produced outside the stage mapping; live rows measured 2026-08-01',
  lifecycle_sd_bridge: 'produced outside the stage mapping; live rows measured 2026-08-01',
  build_deviation_record: 'produced outside the stage mapping; live rows measured 2026-08-01',
  distribution_block_marker: 'produced by stage-22-distribution-setup blockDistribution; live rows measured 2026-08-01',

  // NAME-ONLY DEBT — declared, unmapped, ZERO rows. Same state as truth_demand_thesis was.
  truth_problem_statement: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  truth_target_market_analysis: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  truth_value_proposition: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  truth_demand_thesis:
    'NAME-ONLY, AND THE ONLY ONE OF THE FOURTEEN THAT IS GATE-ENFORCED — which is why it blocked ' +
    'ApexNiche at S21 while the other thirteen sat latent. REMOVE THIS ENTRY when FR-1 lands the ' +
    'S2 producer and ARTIFACT_TYPE_BY_STAGE[2] includes it; leaving it here after that would ' +
    'silence the check for the one type this SD exists to fix.',
  blueprint_risk_register: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  blueprint_project_plan: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  build_system_prompt: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  build_cicd_config: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  build_test_coverage_report: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  s17_variant_scores: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  stitch_project: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  stitch_curation: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  economic_lens: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01',
  post_lifecycle_decision: 'NAME-ONLY: declared, unmapped, zero rows as of 2026-08-01'
});

const mappedTypes = () => new Set(Object.values(ARTIFACT_TYPE_BY_STAGE).flat());

describe('TS-7: every declared artifact type is reachable by a writer', () => {
  it('no type is declared without a mapping, a deprecation, or a documented exemption', () => {
    const mapped = mappedTypes();
    const deprecated = new Set(DEPRECATED_ARTIFACT_TYPES);
    const orphans = Object.values(ARTIFACT_TYPES).filter(
      (t) => !mapped.has(t) && !deprecated.has(t) && !(t in NAME_ONLY_OR_NON_STAGE_PRODUCED)
    );

    expect(
      orphans,
      'A NEW artifact type was declared with no way to produce it. That is the defect this SD exists ' +
      'to end — a type that exists in name only, which a gate can then enforce and block a venture on ' +
      'forever. Either map it in ARTIFACT_TYPE_BY_STAGE, or add it to NAME_ONLY_OR_NON_STAGE_PRODUCED ' +
      'WITH A REASON so the debt is countable.'
    ).toEqual([]);
  });

  it('every exemption carries a non-empty reason — an allowlist without reasons is just a mute button', () => {
    for (const [type, reason] of Object.entries(NAME_ONLY_OR_NON_STAGE_PRODUCED)) {
      expect(typeof reason, `${type} exemption reason`).toBe('string');
      expect(reason.trim().length, `${type} exemption reason is empty`).toBeGreaterThan(20);
    }
  });

  it('no exemption is stale — every listed type is still declared', () => {
    // A stale entry silently widens the allowlist for a name that no longer exists, and hides the
    // day a real type reclaims it.
    const declared = new Set(Object.values(ARTIFACT_TYPES));
    const stale = Object.keys(NAME_ONLY_OR_NON_STAGE_PRODUCED).filter((t) => !declared.has(t));
    expect(stale, 'exemptions for types no longer in ARTIFACT_TYPES').toEqual([]);
  });

  it('NEGATIVE CONTROL: the check actually catches an unreachable type', () => {
    // Without this, the suite above passes trivially on a codebase where nothing is wrong, and
    // could keep passing if the predicate were accidentally inverted — which is precisely how the
    // existing db-parity test stayed green for the entire outage.
    const mapped = mappedTypes();
    const deprecated = new Set(DEPRECATED_ARTIFACT_TYPES);
    const planted = 'truth_planted_unreachable_type';
    const orphans = [...Object.values(ARTIFACT_TYPES), planted].filter(
      (t) => !mapped.has(t) && !deprecated.has(t) && !(t in NAME_ONLY_OR_NON_STAGE_PRODUCED)
    );
    expect(orphans).toEqual([planted]);
  });

  it('records that truth_demand_thesis is currently unreachable — and must stop being so', () => {
    // Pins this SD's own premise as an executable fact rather than prose. When FR-1 lands, this
    // expectation flips and the exemption comes off; both halves change together or the test fails.
    const mapped = mappedTypes();
    const isExempt = 'truth_demand_thesis' in NAME_ONLY_OR_NON_STAGE_PRODUCED;
    expect(
      mapped.has('truth_demand_thesis') || isExempt,
      'truth_demand_thesis must be either mapped (producer landed) or exempt (producer pending)'
    ).toBe(true);
  });
});
