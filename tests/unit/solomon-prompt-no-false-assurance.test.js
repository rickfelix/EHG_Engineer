/**
 * SD-FDBK-INFRA-SOLOMON-SCORECARD-MEASURES-001 — FR-6.
 *
 * The Solomon deep-sweep tick prompt used to tell Solomon its send path had
 * "(dedup + quota + silence-by-default enforced)". checkConsultQuota has ZERO
 * production call sites, so the quota half was false.
 *
 * WHY THIS IS WORSE THAN AN UNWIRED GATE, and why it earns a pinned test:
 * an unwired gate fails silently. A prompt that TELLS AN AGENT a constraint is
 * enforcing actively shapes that agent's behaviour on a false premise — Solomon
 * was operating as though a clamp existed, which is a plausible contributor to
 * how the 2026-07-29 send count reached 193 unnoticed. An agent told the truth
 * about its own constraints self-limits before the code does.
 *
 * This test pins the claim to reality so the prompt cannot drift back into
 * asserting enforcement while the gate remains measurement-only. If a later SD
 * genuinely wires the clamp, this test SHOULD be updated in that same change-set
 * — that is the point: the claim and the code move together or not at all.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const STARTUP_CHECK = join(here, '..', '..', 'scripts', 'solomon-startup-check.mjs');
const ADVISORY = join(here, '..', '..', 'scripts', 'solomon-advisory.cjs');

describe('Solomon tick prompt does not claim an unenforced quota', () => {
  const source = readFileSync(STARTUP_CHECK, 'utf8');

  it('never asserts that quota is enforced', () => {
    // Matches the historical shapes: "quota + silence-by-default enforced",
    // "dedup + quota enforced" — anything asserting quota IS enforced.
    // The NEGATED form ("QUOTA IS MEASURED, NOT ENFORCED") is the correct text
    // and must not trip this, so drop any span carrying a negation. Without
    // that filter the assertion fires on its own fix — a control that fails
    // green is exactly the shape this SD exists to remove.
    const spans = source.match(/quota[^.'"]{0,40}\benforced\b/gi) || [];
    const affirmative = spans.filter((s) => !/\bnot\b/i.test(s));
    expect(affirmative).toEqual([]);
  });

  it('states plainly that quota is measured rather than enforced', () => {
    expect(/QUOTA IS MEASURED, NOT ENFORCED/.test(source)).toBe(true);
  });

  it('still tells Solomon dedup IS enforced — the true half is not lost', () => {
    // Over-correcting into "nothing is enforced" would be its own false premise.
    expect(/dedup IS enforced/i.test(source)).toBe(true);
  });

  it('names the agent as the enforcer of the sweep budget', () => {
    // enforceSweepBudget has no automatic caller either; the prompt must not
    // read as though something invokes it on the agent's behalf.
    expect(/YOU are the enforcer here/.test(source)).toBe(true);
  });
});

describe('the premise this test rests on is still true', () => {
  it('the quota is measured but NOT enforced — which is what makes the prompt truthful', () => {
    // GUARD AGAINST A STALE PIN, corrected during FR-1. The first draft asserted
    // "checkConsultQuota has no production call site", conflating HAS-A-CALLER with
    // IS-ENFORCED. FR-1 separated those: the gate is now invoked on every send, but
    // purely to RECORD what it would have refused. So a call site existing no longer
    // makes the prompt's "not enforced" wording stale.
    //
    // The premise the prompt actually depends on is that nothing ACTS on the verdict.
    // If a future SD adds a clamp, this test must fail and the prompt must change in
    // the same change-set — claim and code move together or not at all.
    const advisory = readFileSync(ADVISORY, 'utf8');

    // The measurement call must exist (otherwise D3 has no signal at all).
    expect(advisory).toMatch(/const quotaMeasurement = await checkConsultQuota\(/);

    // ...and nothing may refuse, exit, or return based on its verdict.
    const enforces = /if\s*\(\s*!quotaMeasurement\.allowed\s*\)[^\n]*(process\.exit|return\s*;|throw)/.test(advisory);
    expect(enforces).toBe(false);
  });
});
