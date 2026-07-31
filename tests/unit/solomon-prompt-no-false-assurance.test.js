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
  it('checkConsultQuota still has no production call site', () => {
    // GUARD AGAINST A STALE PIN: if a later change wires the clamp for real,
    // the prompt SHOULD start saying "enforced" again — and this test would be
    // wrong to keep forbidding it. So assert the premise directly rather than
    // assuming it. NOTE: solomon-advisory.cjs contains a literal NUL byte, so a
    // content-mode grep would skip it; reading the file directly avoids that.
    const advisory = readFileSync(ADVISORY, 'utf8');
    // Discriminate on SHAPE rather than on line position: an invocation is
    // `checkConsultQuota(`, the definition is `function checkConsultQuota(`,
    // and the export lists it bare with a comma and no paren. A position-based
    // filter missed the export because the name sits mid-line in a multi-name
    // module.exports block.
    const callSites = advisory.split('\n').filter((line) => {
      if (!/checkConsultQuota\s*\(/.test(line)) return false;   // not an invocation
      if (/function\s+checkConsultQuota\s*\(/.test(line)) return false; // the definition
      if (/^\s*(\*|\/\/)/.test(line)) return false;             // comment
      return true;
    });
    expect(callSites).toEqual([]);
  });
});
