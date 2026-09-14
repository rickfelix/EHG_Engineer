// SD-LEARN-FIX-ADDRESS-PATTERN-LEARN-151 — regression guard for the LIVE `sdObjectivesDefined`
// validator registered by gate-l-sd-creation.js, the actual code path responsible for the 45
// recorded occurrences of PAT-LES-1a22954978cc.
//
// tests/unit/handoff/validators/sd-objectives-validator.test.js covers a DIFFERENT file
// (scripts/modules/handoff/validators/sd-objectives-validator.js) implementing the same
// score>=30 threshold logic (per the PAT-AUTO-b6e88bcc comment duplicated in both files, "kept
// in sync" by convention, not by shared code). Nothing exercised gate-l-sd-creation.js's own
// registrant directly, so an edit to ITS threshold (e.g. reverting to the old zero-issues check
// PAT-AUTO-b6e88bcc fixed) would pass every existing test while silently regressing the gate
// that is actually wired into the live validator registry (registerGateLValidators, called at
// validator-registry/index.js:38).

import { describe, it, expect } from 'vitest';
import { ValidatorRegistry } from '../../../../../scripts/modules/handoff/validation/validator-registry/core.js';
import { registerGateLValidators } from '../../../../../scripts/modules/handoff/validation/validator-registry/gates/gate-l-sd-creation.js';

function getValidator() {
  const registry = new ValidatorRegistry();
  registerGateLValidators(registry);
  const validate = registry.get('sdObjectivesDefined');
  if (!validate) throw new Error('sdObjectivesDefined not registered');
  return validate;
}

describe('gate-l-sd-creation: sdObjectivesDefined (the live Gate L validator)', () => {
  it('scores 0 and fails when no objectives and no success_metrics', async () => {
    const validate = getValidator();
    const result = await validate({ sd: { strategic_objectives: [] } });
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.issues).toContain('SD has no strategic objectives defined');
  });

  it('PAT-AUTO-b6e88bcc regression: 1 objective + no metrics (score 35) PASSES at the >=30 threshold', async () => {
    const validate = getValidator();
    const result = await validate({ sd: { strategic_objectives: ['Improve user auth'] } });
    expect(result.score).toBe(35);
    // The load-bearing assertion: a zero-issues check would have failed this (issues is
    // non-empty — the warning about wanting 2+ objectives lives in `warnings`, not `issues`,
    // but the OLD pre-fix behavior asserted `passed: issues.length === 0`). Asserting the
    // threshold-based boolean directly is what would catch a reversion.
    expect(result.passed).toBe(true);
  });

  it('1 objective + success_metrics present (score 65) passes', async () => {
    const validate = getValidator();
    const result = await validate({
      sd: { strategic_objectives: ['Improve auth'], success_metrics: ['Reduce auth failures by 50%'] }
    });
    expect(result.score).toBe(65);
    expect(result.passed).toBe(true);
  });

  it('2+ objectives with no metrics (score 70) passes with a metrics warning', async () => {
    const validate = getValidator();
    const result = await validate({ sd: { strategic_objectives: ['Objective A', 'Objective B'] } });
    expect(result.score).toBe(70);
    expect(result.passed).toBe(true);
    expect(result.warnings).toContain('SD should have success metrics defined');
  });

  it('2+ objectives and success_metrics (score 100) passes cleanly', async () => {
    const validate = getValidator();
    const result = await validate({
      sd: {
        strategic_objectives: ['Implement feature X', 'Improve performance by 30%'],
        success_metrics: ['Response time < 200ms', 'Zero downtime deployment']
      }
    });
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('missing sd entirely: score 0, fails', async () => {
    const validate = getValidator();
    const result = await validate({});
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('PAT-AUTO-b6e88bcc boundary: 0 objectives + success_metrics present (score exactly 30) PASSES despite a non-empty issues array', async () => {
    // This is the ONE input shape that actually distinguishes `passed: score >= 30` from the
    // pre-fix `passed: issues.length === 0`: zero objectives means `issues` is non-empty (the
    // "no strategic objectives" issue is always pushed), yet success_metrics alone is enough to
    // reach the 30-point threshold. A zero-issues check would fail this case; the threshold
    // check passes it. Every other case in this file happens to agree between the two formulas,
    // so this is the load-bearing regression check.
    const validate = getValidator();
    const result = await validate({
      sd: { strategic_objectives: [], success_metrics: ['Reduce auth failures by 50%'] }
    });
    expect(result.score).toBe(30);
    expect(result.issues).toContain('SD has no strategic objectives defined');
    expect(result.passed).toBe(true);
  });
});
