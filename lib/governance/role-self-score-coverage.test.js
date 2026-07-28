/**
 * FR-1: a partial rubric score must say so, without becoming a false failure.
 * SD-LEO-INFRA-ROLE-SESSION-SELF-001.
 *
 * THE DEFECT. A 3-of-8 sample rendered as "12/15 (4.0/5)" — denominator-SHAPED, so it reads in the
 * visual grammar of full coverage. That is worse than carrying no denominator at all, because it
 * invites the reader to believe one was applied. Adam's live cycle-11 row is exactly that string.
 *
 * THE TRAP IN THE OBVIOUS FIX, which these tests exist to hold the line on. "Render against TOTAL"
 * sounds right and is wrong: Solomon scores exactly ONE of five dimensions (the other four are
 * structurally unscoreable), so a total-based divisor turns its honest 5/5 (5.0/5) into
 * 5/25 (1.0/5) — converting "we measured one thing and it was excellent" into a failing grade.
 * UNMEASURED IS NOT ZERO. The average stays over scored; the coverage is stated out loud.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import path from 'node:path';

const require_ = createRequire(import.meta.url);
const core = require_(path.resolve(__dirname, './role-self-score.cjs'));

/** An 8-dimension role, like Adam. */
const CONFIG_8 = {
  role: 'testrole',
  dimensions: ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'],
  generatedBy: 'test',
};
/** A 5-dimension role, like Solomon — four of whose dimensions never carry a signal. */
const CONFIG_5 = { role: 'solomonish', dimensions: ['D1', 'D2', 'D3', 'D4', 'D5'], generatedBy: 'test' };

const assemble = (dimensions, config, inconclusive) => core.assembleScore({
  dimensions, cycle: 1, session: 's', committedActions: [], priorOutcomes: [],
  provenance: {}, belowThreshold: [], date: '2026-07-28', config, inconclusive,
});

describe('A4 — the partial headline states its coverage', () => {
  it('the exact pre-fix string is no longer producible from a 3-of-8 sample', () => {
    const score = assemble({ D1: 4, D2: 5, D8: 3 }, CONFIG_8, ['D3', 'D4', 'D5', 'D6', 'D7']);
    // Positive assertion, not merely !== : a bare not-equals is satisfied by appending anything.
    expect(score.overall).toBe('12/15 (4.0/5) — 3 of 8 dimensions measured');
    expect(score.overall).not.toBe('12/15 (4.0/5)');
  });

  it('carries coverage {scored, total} as a field, not only in the string', () => {
    const score = assemble({ D1: 4, D2: 5, D8: 3 }, CONFIG_8, ['D3', 'D4', 'D5', 'D6', 'D7']);
    expect(score.coverage.scored).toBe(3);
    expect(score.coverage.total).toBe(8);
    expect(score.coverage.unmeasured.sort()).toEqual(['D3', 'D4', 'D5', 'D6', 'D7']);
  });
});

describe('A1 — the control the full-coverage case cannot provide', () => {
  it('SOLOMON SHAPE: one excellent dimension of five stays 5.0, it does not become 1.0', () => {
    // The whole reason the average is not divided by total. Solomon can NEVER reach full coverage,
    // so a full-coverage negative control is unreachable for the role most exposed to this.
    const score = assemble({ D1: 5 }, CONFIG_5, ['D2', 'D3', 'D4', 'D5']);
    expect(score.overall).toContain('(5.0/5)');
    expect(score.overall).not.toContain('(1.0/5)');
    expect(score.coverage).toMatchObject({ scored: 1, total: 5 });
  });

  it('NEGATIVE CONTROL — a full-coverage score keeps its clean headline unchanged', () => {
    // Without this, "always append coverage" would pass everything above while making healthy
    // scores look degraded — fixing an over-claim by installing a permanent caveat.
    const dims = Object.fromEntries(CONFIG_8.dimensions.map((d) => [d, 4]));
    const score = assemble(dims, CONFIG_8, []);
    expect(score.overall).toBe('32/40 (4.0/5)');
    expect(score.overall).not.toContain('measured');
  });
});

describe('A3 — the arithmetic cannot compare a value to itself', () => {
  it('total comes from the ROLE CONFIG, not from the payload we just built', () => {
    // Deriving total from Object.keys(provenance) would make this check structurally unable to
    // fail — the defect class this entire SD is about.
    const score = assemble({ D1: 4 }, CONFIG_8, ['D2']);   // deliberately inconsistent input
    expect(score.coverage.total).toBe(CONFIG_8.dimensions.length);
    expect(score.coverage.total).not.toBe(2);
  });

  it('scored + unmeasured accounts for every dimension on a well-formed score', () => {
    const score = assemble({ D1: 4, D2: 5, D8: 3 }, CONFIG_8, ['D3', 'D4', 'D5', 'D6', 'D7']);
    expect(score.coverage.scored + score.coverage.unmeasured.length).toBe(score.coverage.total);
  });
});

describe('A2 — THE BLOCKING ONE: this fix must not stop the writers', () => {
  it('UNMEASURED never appears numerically inside `dimensions`', () => {
    // verify-score-contract.mjs classifyDimensions recomputes below-threshold FROM the dimensions
    // map. An UNMEASURED marker stored there as 0 would make every unmeasured dimension read as
    // below-threshold, trip Rule 1 INVALID, and cause all three writers to refuse to write —
    // a transparency fix causing a total outage of self-scoring.
    const score = assemble({ D1: 4, D2: 5, D8: 3 }, CONFIG_8, ['D3', 'D4', 'D5', 'D6', 'D7']);
    expect(Object.keys(score.dimensions).sort()).toEqual(['D1', 'D2', 'D8']);
    for (const dim of score.coverage.unmeasured) {
      expect(score.dimensions).not.toHaveProperty(dim);
    }
  });

  it('below_threshold is unchanged by the coverage fix', () => {
    // The signal the writers gate on must be byte-identical to its pre-fix value.
    // belowThreshold is deliberately OMITTED so assembleScore's own derivation runs — passing []
    // would be truthy and short-circuit the very code path this test exists to protect.
    const dims = { D1: 4, D2: 1, D8: 3 };
    const score = core.assembleScore({
      dimensions: dims, cycle: 1, session: 's', committedActions: [], priorOutcomes: [],
      provenance: {}, date: '2026-07-28', config: CONFIG_8, inconclusive: ['D3', 'D4', 'D5', 'D6', 'D7'],
    });
    expect(score.below_threshold).toEqual(core.classifyBelowThreshold(dims));
    expect(score.below_threshold).toEqual(['D2']);
  });
});

describe('degenerate inputs do not throw', () => {
  it('no inconclusive array, and a config without dimensions, both degrade quietly', () => {
    expect(() => assemble({ D1: 4 }, CONFIG_8, undefined)).not.toThrow();
    expect(core.computeCoverage({ D1: 4 }, {}, []).total).toBe(0);
    expect(core.overallString({ D1: 4 }, null)).toBe('4/5 (4.0/5)');
  });
});
