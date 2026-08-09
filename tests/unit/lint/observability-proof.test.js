/**
 * SD-LEO-INFRA-STANDING-OBSERVABILITY-ACCEPTANCE-001 (FR-1) — hasObservabilityProof.
 *
 * A seed trial proves a control FIRES on a planted defect, but in a FIXTURE. That is proof of LOGIC,
 * not of OBSERVABILITY-WHERE-IT-RUNS, and the two come apart constantly: five measured instances on
 * 2026-08-08 were controls whose logic was sound and that never RECEIVED the input they needed.
 *
 * THE PASSING CASE IS ASSERTED FIRST, deliberately. If the predicate were broken to always-false,
 * every rejection test below would still pass while the check silently blocked everything — so the
 * accept case is the control, and it goes first.
 *
 * THE PLACEHOLDER TESTS ARE THE LOAD-BEARING ONES. This check's own top risk, recorded in the PRD,
 * is that it becomes a formality: the obvious fix for a blind guard is usually blind too, and an
 * observability_proof nobody reads would pass forever while proving nothing.
 *
 * Typed UNIT deliberately: tests/integration/** resolves to ZERO FILES here, so an integration-typed
 * test would SKIP AND REPORT GREEN.
 */

import { describe, it, expect } from 'vitest';
import { hasObservabilityProof } from '../../../scripts/lint/control-seed-test-lint.mjs';

/** A proof shaped the way the requirement intends: names the input, and where a real positive was seen. */
const GOOD = {
  observability_proof: {
    input: 'changed control files intersected with control-seed-specs.json; each control source text; per-trial child exit code and stdout',
    seen: 'blocked PR #6875 in CI on 2026-08-08 with 5 findings across 5 controls',
  },
};

describe('hasObservabilityProof — the accept case (CONTROL, asserted first)', () => {
  it('[CONTROL] ACCEPTS a proof naming both the input and where a real positive was seen', () => {
    // If this fails, every rejection assertion below is meaningless — a predicate stuck at false
    // "rejects" everything, including valid proofs, and would read as a working guard.
    expect(hasObservabilityProof(GOOD)).toBe(true);
  });
});

describe('hasObservabilityProof — rejections', () => {
  it('rejects a spec with no observability_proof at all', () => {
    expect(hasObservabilityProof({ name: 'some-control' })).toBe(false);
  });

  it('rejects a spec that is null or undefined', () => {
    expect(hasObservabilityProof(null)).toBe(false);
    expect(hasObservabilityProof(undefined)).toBe(false);
  });

  it('rejects a proof that is an ARRAY rather than an object', () => {
    // Arrays are typeof 'object', so this branch needs its own case — a naive typeof check passes it.
    expect(hasObservabilityProof({ observability_proof: ['input', 'seen'] })).toBe(false);
  });

  it('rejects a proof that is a bare string rather than an object', () => {
    expect(hasObservabilityProof({ observability_proof: 'we checked it in CI' })).toBe(false);
  });

  it('requires BOTH halves — input alone does not satisfy', () => {
    expect(hasObservabilityProof({ observability_proof: { input: GOOD.observability_proof.input } })).toBe(false);
  });

  it('requires BOTH halves — seen alone does not satisfy', () => {
    expect(hasObservabilityProof({ observability_proof: { seen: GOOD.observability_proof.seen } })).toBe(false);
  });

  it('rejects an EMPTY or whitespace-only input', () => {
    expect(hasObservabilityProof({ observability_proof: { input: '', seen: GOOD.observability_proof.seen } })).toBe(false);
    expect(hasObservabilityProof({ observability_proof: { input: '   \t ', seen: GOOD.observability_proof.seen } })).toBe(false);
  });

  it('rejects an EMPTY or whitespace-only seen', () => {
    expect(hasObservabilityProof({ observability_proof: { input: GOOD.observability_proof.input, seen: '' } })).toBe(false);
    expect(hasObservabilityProof({ observability_proof: { input: GOOD.observability_proof.input, seen: '  ' } })).toBe(false);
  });

  it('rejects non-string halves (a number or object is not a declaration)', () => {
    expect(hasObservabilityProof({ observability_proof: { input: 42, seen: GOOD.observability_proof.seen } })).toBe(false);
    expect(hasObservabilityProof({ observability_proof: { input: GOOD.observability_proof.input, seen: { run: 1 } } })).toBe(false);
  });
});

/**
 * Each placeholder is isolated to ONE case. A single test listing several would pass while only one
 * branch actually matched — a case satisfying two branches cannot tell you which one fired.
 */
describe('[THE LOAD-BEARING TESTS] placeholders that LOOK like a declaration are rejected', () => {
  const PLACEHOLDERS = ['none', 'N/A', 'n/a', 'na', 'TBD', 'todo', 'unknown', 'yes', 'ok', 'done', 'see above', '-', '---'];

  it.each(PLACEHOLDERS)('rejects %j as the input half', (placeholder) => {
    expect(hasObservabilityProof({ observability_proof: { input: placeholder, seen: GOOD.observability_proof.seen } })).toBe(false);
  });

  it.each(PLACEHOLDERS)('rejects %j as the seen half', (placeholder) => {
    expect(hasObservabilityProof({ observability_proof: { input: GOOD.observability_proof.input, seen: placeholder } })).toBe(false);
  });

  it('is case- and whitespace-insensitive about placeholders', () => {
    expect(hasObservabilityProof({ observability_proof: { input: '  NONE  ', seen: GOOD.observability_proof.seen } })).toBe(false);
    expect(hasObservabilityProof({ observability_proof: { input: GOOD.observability_proof.input, seen: ' TbD ' } })).toBe(false);
  });

  it('[TWO-SIDED] does NOT reject real prose that merely CONTAINS a placeholder word', () => {
    // Over-suppression is the failure this rejection could introduce. "none" appears inside a
    // legitimate sentence here, and the proof must still pass — the placeholder rule matches the
    // WHOLE trimmed value, not a substring. A rule that rejected any mention would push authors
    // toward vaguer proofs to avoid tripping it, which is the opposite of the goal.
    expect(hasObservabilityProof({
      observability_proof: {
        input: 'reads roadmap_wave_items.promoted_to_sd_key; consumes none of the environment variables',
        seen: 'observed firing in CI run 31244149348; no fixture involved',
      },
    })).toBe(true);
  });
});
