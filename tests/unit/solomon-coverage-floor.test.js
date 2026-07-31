/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-3 (TS-5, TS-6).
 *
 * The coverage-honest HEADLINE already shipped on 2026-07-28 (commit 27f9938e5ee7),
 * three days before this SD was written — the string the brief quoted as the defect
 * IS the shipped fix. So this FR is deliberately narrow: it adds the FLOOR that was
 * genuinely missing, and rebuilds nothing.
 *
 * Saying coverage out loud made a thin score honest but not actionable: nothing
 * consumed coverage.scored, so a 1-of-5 cycle rendered its caveat and passed on by.
 *
 * SOFT-FLAG, NEVER A REFUSAL. The writer's stated invariant is
 * fail-open/never-break-a-tick. A gate that can break the tick manufactures pressure
 * to bypass it, and a bypassed gate is worse than an advisory one because it still
 * looks enforcing.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const require_ = createRequire(import.meta.url);
const core = require_(join(here, '..', '..', 'lib', 'governance', 'role-self-score.cjs'));

const config = (n, extra = {}) => ({
  role: 'solomon',
  dimensions: Array.from({ length: n }, (_, i) => `D${i + 1}`),
  generatedBy: 'test',
  ...extra,
});
const build = (dims, total, extra) =>
  core.assembleScore({
    dimensions: dims, cycle: 1, session: 's', date: '2026-07-31',
    config: config(total, extra), inconclusive: [],
  });

describe('the coverage floor flags a thin cycle', () => {
  it('2 of 5 measured is below the 0.5 floor', () => {
    const s = build({ D1: 5, D3: 1 }, 5);          // Solomon's real shape today
    expect(s.coverage.below_floor).toBe(true);
    expect(s.coverage.scored).toBe(2);
    expect(s.coverage.floor).toBe(0.5);
  });

  it('3 of 5 measured clears the floor', () => {
    const s = build({ D1: 5, D2: 4, D3: 1 }, 5);
    expect(s.coverage.below_floor).toBe(false);
  });

  it('full coverage is never flagged', () => {
    const s = build({ D1: 5, D2: 5, D3: 5, D4: 5, D5: 5 }, 5);
    expect(s.coverage.below_floor).toBe(false);
  });

  it('the floor is configurable per role and stated explicitly', () => {
    const strict = build({ D1: 5, D2: 4, D3: 1 }, 5, { coverageFloor: 0.9 });
    expect(strict.coverage.floor).toBe(0.9);
    expect(strict.coverage.below_floor).toBe(true);   // 0.6 < 0.9
  });
});

describe('the floor never breaks the tick (TS-5)', () => {
  it('a sub-floor cycle still produces a complete, writable score object', () => {
    const s = build({ D1: 5 }, 5);                 // 1 of 5 — as thin as it gets
    expect(s.coverage.below_floor).toBe(true);
    // The write must still be possible: every field the insert path needs is present.
    expect(s.overall).toBeTypeOf('string');
    expect(s.review_key).toBeTypeOf('string');
    expect(s.dimensions).toBeTypeOf('object');
    expect(s.below_threshold).toBeInstanceOf(Array);
  });

  it('assembleScore does not throw on an all-inconclusive cycle', () => {
    expect(() => build({}, 5)).not.toThrow();
    const s = build({}, 5);
    expect(s.coverage.scored).toBe(0);
    expect(s.coverage.below_floor).toBe(true);
  });
});

describe('the already-shipped headline was NOT rebuilt (TS-6)', () => {
  it('overallString output is byte-identical to the shipped format', () => {
    // The shipped behaviour: partial coverage appends the tail, full coverage does not.
    const partial = build({ D1: 5, D3: 1 }, 5);
    expect(partial.overall).toBe('6/10 (3.0/5) — 2 of 5 dimensions measured');
    const full = build({ D1: 5, D2: 5, D3: 5, D4: 5, D5: 5 }, 5);
    expect(full.overall).toBe('25/25 (5.0/5)');    // no tail when complete
  });

  it('the floor lives beside the headline, not inside it', () => {
    // A floor breach must not alter the grade string — that would be rebuilding
    // the shipped fix rather than adding to it.
    const s = build({ D1: 5, D3: 1 }, 5);
    expect(s.coverage.below_floor).toBe(true);
    expect(s.overall).not.toMatch(/floor|LOW-COVERAGE/i);
  });

  it('verify-score-contract blocking rules were not extended', () => {
    // The ruling was explicit: soft-flag, do not make coverage blocking.
    const contract = readFileSync(join(here, '..', '..', 'lib', 'fleet', 'verify-score-contract.mjs'), 'utf8');
    expect(contract).not.toMatch(/below_floor/);
    expect(contract).not.toMatch(/coverageFloor/);
  });
});
