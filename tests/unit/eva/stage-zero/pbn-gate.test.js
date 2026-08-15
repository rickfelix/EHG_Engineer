/**
 * Unit tests: PBN hard gate rules (pure functions) — SD-LEO-FEAT-PROVEN-BETTER-NEW-001.
 * PRD test scenarios: TS-1, TS-2, TS-3a, TS-3b, TS-4.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { join } from 'path';
import {
  resolveCitation,
  resolveBucketCoverage,
  evaluatePbnVerdict,
  buildPbnVerdict,
  PBN_RULES,
} from '../../../../lib/eva/stage-zero/pbn-gate.js';
import { PROVEN_CLONE_BUCKETS, ALL_NEW_BUCKETS } from '../../../fixtures/pbn-fixtures.js';

// US-008 AC #5: proven-clone and all-new derive from the one shared fixture module rather than
// private near-copies (chairman-review.test.js and pbn-gate-flow.test.js reference the same
// module). two-wedge is TWO_WEDGE_BUCKETS, used directly where needed below.
const realCitation = PROVEN_CLONE_BUCKETS.proven.citations[0];
const fabricatedCitation = { source: 'Something real-sounding', measured: 'made up' }; // no reference field
const provenCloneBucket = PROVEN_CLONE_BUCKETS.proven;
const emptyProvenBucket = ALL_NEW_BUCKETS.proven;
const uncoverableProvenBucket = { mechanic: 'claimed mechanic', citations: [fabricatedCitation], coverage: true }; // LLM claims coverage but citation doesn't resolve

describe('resolveCitation (FR-5, hermetic check)', () => {
  it('resolves a well-formed citation with source + reference', () => {
    expect(resolveCitation(realCitation)).toBe(true);
  });
  it('does not resolve a citation missing the reference field', () => {
    expect(resolveCitation(fabricatedCitation)).toBe(false);
  });
  it('does not resolve null/undefined/non-object', () => {
    expect(resolveCitation(null)).toBe(false);
    expect(resolveCitation(undefined)).toBe(false);
    expect(resolveCitation('a string')).toBe(false);
  });
  it('does not resolve a citation with empty-string fields', () => {
    expect(resolveCitation({ source: '', reference: '' })).toBe(false);
    expect(resolveCitation({ source: '   ', reference: '   ' })).toBe(false);
  });

  // US-001 AC #2: length floors mirror invariant-library.js:132,137 (source>=8, measured>=20)
  // — a trivially short field is a bare assertion, not a real citation, and must not resolve.
  it('does not resolve a citation whose source is shorter than invariant-library.js\'s 8-char floor', () => {
    expect(resolveCitation({ source: 'x'.repeat(7), measured: 'a'.repeat(20), reference: 'r' })).toBe(false);
    expect(resolveCitation({ source: 'x'.repeat(8), measured: 'a'.repeat(20), reference: 'r' })).toBe(true);
  });
  it('does not resolve a citation whose measured is shorter than invariant-library.js\'s 20-char floor', () => {
    expect(resolveCitation({ source: 'x'.repeat(8), measured: 'a'.repeat(19), reference: 'r' })).toBe(false);
    expect(resolveCitation({ source: 'x'.repeat(8), measured: 'a'.repeat(20), reference: 'r' })).toBe(true);
  });
  it('a bare string standing in for a citation object never resolves regardless of its length', () => {
    expect(resolveCitation('a'.repeat(50))).toBe(false);
  });
});

describe('resolveBucketCoverage (FR-3 deterministic backstop)', () => {
  it('true when LLM reports coverage AND a citation actually resolves', () => {
    expect(resolveBucketCoverage(provenCloneBucket)).toBe(true);
  });
  it('false when LLM reports coverage=false, regardless of citations present', () => {
    expect(resolveBucketCoverage({ coverage: false, citations: [realCitation] })).toBe(false);
  });
  it('false when LLM claims coverage=true but no citation actually resolves — the fabrication-resistance case', () => {
    // This is the exact scenario TS-4 (citation resolution catches a fabricated claim) exercises.
    expect(resolveBucketCoverage(uncoverableProvenBucket)).toBe(false);
  });
  it('false for an empty/absent bucket', () => {
    expect(resolveBucketCoverage(emptyProvenBucket)).toBe(false);
    expect(resolveBucketCoverage(undefined)).toBe(false);
  });
});

describe('evaluatePbnVerdict (FR-2 hard gate rules)', () => {
  // TS-1: proven-clone idea passes the gate
  it('PASS when proven is evidenced and wedge_count <= 1', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'one wedge', wedge_count: 1, coverage: true },
    });
    expect(result.verdict).toBe('PASS');
    // Verdict-driving rules: none fired (proven is evidenced, wedge_count<=1).
    const verdictRuleIds = result.rule_trace
      .filter((r) => r.rule_id !== PBN_RULES.NO_RESOLVABLE_REFERENT)
      .map((r) => r.rule_id);
    expect(verdictRuleIds).toEqual([]);
    // Coverage-reporting (US-006 AC #3, FR-3): better is coverage=false by design (FR-2 iii —
    // recorded as a future hypothesis, not gated) and still gets its own trace entry.
    expect(result.rule_trace).toContainEqual(
      expect.objectContaining({ rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT, bucket: 'better' }),
    );
  });

  // TS-2: all-new idea is rejected on the empty-proven rule
  it('REJECT with EMPTY_PROVEN when proven bucket is not evidenced', () => {
    const result = evaluatePbnVerdict({
      proven: emptyProvenBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    expect(result.verdict).toBe('REJECT');
    const verdictRuleIds = result.rule_trace
      .filter((r) => r.rule_id !== PBN_RULES.NO_RESOLVABLE_REFERENT)
      .map((r) => r.rule_id);
    expect(verdictRuleIds).toEqual([PBN_RULES.EMPTY_PROVEN]);
    // Coverage-reporting: both proven and better are coverage=false here, each traced.
    expect(result.rule_trace).toContainEqual(
      expect.objectContaining({ rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT, bucket: 'proven' }),
    );
    expect(result.rule_trace).toContainEqual(
      expect.objectContaining({ rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT, bucket: 'better' }),
    );
  });

  // TS-3a: two-wedge idea with an evidenced proven bucket TRIMS
  it('TRIM with NEW_MULTI_WEDGE when wedge_count > 1 but proven IS evidenced', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'two wedges named', wedge_count: 2, coverage: true },
    });
    expect(result.verdict).toBe('TRIM');
    const verdictRuleIds = result.rule_trace
      .filter((r) => r.rule_id !== PBN_RULES.NO_RESOLVABLE_REFERENT)
      .map((r) => r.rule_id);
    expect(verdictRuleIds).toEqual([PBN_RULES.NEW_MULTI_WEDGE]);
    expect(result.resolved.proven_coverage).toBe(true);
    // proven IS covered here, so only better gets a coverage-reporting entry.
    expect(result.rule_trace).toContainEqual(
      expect.objectContaining({ rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT, bucket: 'better' }),
    );
    expect(result.rule_trace.filter((r) => r.bucket === 'proven')).toEqual([]);
  });

  // TS-3b: two-wedge idea with an UNevidenced proven bucket REJECTS (rules compound)
  it('REJECT with BOTH EMPTY_PROVEN and NEW_MULTI_WEDGE when both rules fire', () => {
    const result = evaluatePbnVerdict({
      proven: emptyProvenBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'two wedges', wedge_count: 2, coverage: true },
    });
    expect(result.verdict).toBe('REJECT');
    const ruleIds = result.rule_trace.map((r) => r.rule_id);
    expect(ruleIds).toContain(PBN_RULES.EMPTY_PROVEN);
    expect(ruleIds).toContain(PBN_RULES.NEW_MULTI_WEDGE);
    const verdictRuleIds = result.rule_trace
      .filter((r) => r.rule_id !== PBN_RULES.NO_RESOLVABLE_REFERENT)
      .map((r) => r.rule_id);
    expect(verdictRuleIds).toHaveLength(2);
    // Both proven and better are coverage=false — each independently traced (US-006 AC #3).
    expect(result.rule_trace.filter((r) => r.rule_id === PBN_RULES.NO_RESOLVABLE_REFERENT)).toHaveLength(2);
  });

  it('wedge_count derives from a truthy wedge string when the LLM omits an explicit count', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { citations: [], coverage: false },
      new: { wedge: 'implied single wedge' }, // no wedge_count field
    });
    expect(result.resolved.wedge_count).toBe(1);
    expect(result.verdict).toBe('PASS');
  });

  it('wedge_count is 0 when there is no wedge at all', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { citations: [], coverage: false },
      new: {},
    });
    expect(result.resolved.wedge_count).toBe(0);
    expect(result.verdict).toBe('PASS');
  });
});

describe('module loads under plain node (US-001 AC #5 — VITEST≠NODE regression guard)', () => {
  it('pbn-scoring.js, pbn-gate.js and pbn-integration.js all load with no unresolved import outside vitest', () => {
    const root = join(__dirname, '..', '..', '..', '..');
    const script = [
      "import('./lib/eva/stage-zero/pbn-scoring.js')",
      ".then(() => import('./lib/eva/stage-zero/pbn-gate.js'))",
      ".then(() => import('./lib/eva/stage-zero/pbn-integration.js'))",
      ".then(() => console.log('OK'))",
      '.catch((e) => { console.error(e.message); process.exit(1); })',
    ].join('');
    const output = execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' });
    expect(output.trim()).toBe('OK');
  });
});

describe('rule_trace coverage-reporting (US-006 AC #3, #5 — FR-3 machine-readable home)', () => {
  it('a coverage=false bucket gets a rule_trace entry naming the bucket and the reason, distinguishable from a covered one', () => {
    const result = evaluatePbnVerdict({
      proven: provenCloneBucket, // covered
      better: { hypothesis: 'h', citations: [], coverage: false }, // uncovered
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    const betterEntry = result.rule_trace.find((r) => r.bucket === 'better');
    expect(betterEntry).toEqual(
      expect.objectContaining({ rule_id: PBN_RULES.NO_RESOLVABLE_REFERENT, fired: true, bucket: 'better' }),
    );
    expect(typeof betterEntry.detail).toBe('string');
    expect(betterEntry.detail.length).toBeGreaterThan(0);
    // No entry at all for the covered bucket — coverage=true is never traced as a "reason".
    expect(result.rule_trace.some((r) => r.bucket === 'proven')).toBe(false);
  });

  it('coverage flips true and the rule_trace entry disappears once a referent becomes available at re-score — coverage is a measurement in time, not a permanent label', () => {
    const uncovered = evaluatePbnVerdict({
      proven: emptyProvenBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    expect(uncovered.rule_trace.some((r) => r.bucket === 'proven')).toBe(true);
    expect(uncovered.verdict).toBe('REJECT');

    // Same idea, re-scored later with a now-resolvable referent for proven.
    const rescored = evaluatePbnVerdict({
      proven: provenCloneBucket,
      better: { hypothesis: 'h', citations: [], coverage: false },
      new: { wedge: 'w', wedge_count: 1, coverage: true },
    });
    expect(rescored.rule_trace.some((r) => r.bucket === 'proven')).toBe(false);
    expect(rescored.verdict).toBe('PASS');
  });
});

describe('buildPbnVerdict (persisted shape)', () => {
  it('produces the full shape matching the migration CHECK constraint (proven/better/new/verdict/measured_at/rule_trace)', () => {
    const verdict = buildPbnVerdict(
      {
        proven: provenCloneBucket,
        better: { hypothesis: 'h', friction_point: 'f', citations: [realCitation], coverage: true },
        new: { wedge: 'w', wedge_count: 1, coverage: true },
      },
      { now: '2026-08-15T12:00:00.000Z' }
    );
    expect(verdict.verdict).toBe('PASS');
    expect(verdict.measured_at).toBe('2026-08-15T12:00:00.000Z');
    expect(Array.isArray(verdict.rule_trace)).toBe(true);
    expect(verdict.proven.coverage).toBe(true);
    expect(verdict.better.coverage).toBe(true);
    expect(verdict.new.wedge_count).toBe(1);
  });

  it('the persisted proven.coverage reflects the RESOLVED value, not the LLM self-report, when they disagree', () => {
    // TS-4 exact scenario: LLM claims coverage=true but the citation is fabricated/unresolvable.
    const verdict = buildPbnVerdict({
      proven: uncoverableProvenBucket,
      better: { citations: [], coverage: false },
      new: { wedge_count: 1 },
    });
    expect(verdict.proven.coverage).toBe(false); // resolved, not the LLM's claimed true
    expect(verdict.verdict).toBe('REJECT');
  });

  it('re-invocation with a later "now" produces a strictly newer measured_at (FR-2 v, unpark re-check)', () => {
    const first = buildPbnVerdict({ proven: provenCloneBucket, better: { citations: [], coverage: false }, new: { wedge_count: 1 } }, { now: '2026-08-15T12:00:00.000Z' });
    const second = buildPbnVerdict({ proven: provenCloneBucket, better: { citations: [], coverage: false }, new: { wedge_count: 1 } }, { now: '2026-08-16T12:00:00.000Z' });
    expect(Date.parse(second.measured_at)).toBeGreaterThan(Date.parse(first.measured_at));
  });

  it('scoring_error is null when the scorer succeeded (the common case)', () => {
    const verdict = buildPbnVerdict({ proven: provenCloneBucket, better: { citations: [], coverage: false }, new: { wedge_count: 1 } });
    expect(verdict.scoring_error).toBeNull();
  });

  // Adversarial review finding (deep-tier /ship gate, post-PLAN-TO-LEAD): pbn-scoring.js's
  // fail-closed catch path returns all-uncoverable buckets plus `scoring_error`, which fires
  // EMPTY_PROVEN and produces a REJECT textually identical to a genuinely-evaluated,
  // evidence-free idea. Before this fix, buildPbnVerdict silently dropped scoring_error.
  it('a scorer failure (buckets.scoring_error set) surfaces both a SCORING_FAILED rule_trace entry and the top-level scoring_error field', () => {
    const failedBuckets = {
      proven: { mechanic: null, citations: [], coverage: false },
      better: { hypothesis: null, friction_point: null, citations: [], coverage: false },
      new: { wedge: null, wedge_count: 0, coverage: false },
      scoring_error: 'Request timed out after 30000ms',
    };
    const verdict = buildPbnVerdict(failedBuckets);
    expect(verdict.verdict).toBe('REJECT'); // fail-closed verdict computation is unchanged
    expect(verdict.scoring_error).toBe('Request timed out after 30000ms');
    const scoringFailedEntry = verdict.rule_trace.find((r) => r.rule_id === 'SCORING_FAILED');
    expect(scoringFailedEntry).toBeDefined();
    expect(scoringFailedEntry.fired).toBe(true);
    expect(scoringFailedEntry.detail).not.toContain('30000ms'); // code-authored only, never buckets.scoring_error itself
  });

  it('a genuine (non-scorer-failure) REJECT carries no SCORING_FAILED entry', () => {
    const verdict = buildPbnVerdict({ proven: uncoverableProvenBucket, better: { citations: [], coverage: false }, new: { wedge_count: 1 } });
    expect(verdict.verdict).toBe('REJECT');
    expect(verdict.rule_trace.find((r) => r.rule_id === 'SCORING_FAILED')).toBeUndefined();
  });
});
