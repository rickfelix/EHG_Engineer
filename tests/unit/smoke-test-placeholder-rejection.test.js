import { describe, it, expect, vi } from 'vitest';

// Keep the gate's optional AI validator out of the unit test (no LLM call).
vi.mock('../../scripts/modules/handoff/human-verification-validator.js', () => ({}));

import {
  DEFAULT_SMOKE_OUTCOME_MARKERS,
  isAllPlaceholderSmokeSteps,
} from '../../scripts/modules/handoff/smoke-test-defaults.js';
import { extractSmokeTestSteps } from '../../scripts/modules/plan-parser.js';
import { validateSmokeTestSpecification } from '../../scripts/modules/handoff/executors/lead-to-plan/gates/smoke-test-specification.js';

const PLACEHOLDER_STEPS = [
  { step_number: 1, instruction: 'Navigate to the relevant page/area for: X', expected_outcome: 'Page loads without errors' },
  { step_number: 2, instruction: 'Verify the primary functionality works as expected', expected_outcome: 'Core feature operates correctly with expected behavior' },
  { step_number: 3, instruction: 'Test an edge case or error scenario', expected_outcome: 'Appropriate error handling or graceful degradation' },
];
const REAL_STEPS = [
  { step_number: 1, instruction: 'Open /chairman/ventures', expected_outcome: 'A telemetry signal of Scale shows for CronGenius' },
];

describe('isAllPlaceholderSmokeSteps', () => {
  it('true only when EVERY step is a known generic placeholder', () => {
    expect(isAllPlaceholderSmokeSteps(PLACEHOLDER_STEPS)).toBe(true);
    expect(DEFAULT_SMOKE_OUTCOME_MARKERS.has('Script executes without errors')).toBe(true);
  });
  it('false for real steps, empty, or a mix (one real step is enough)', () => {
    expect(isAllPlaceholderSmokeSteps(REAL_STEPS)).toBe(false);
    expect(isAllPlaceholderSmokeSteps([])).toBe(false);
    expect(isAllPlaceholderSmokeSteps([PLACEHOLDER_STEPS[0], REAL_STEPS[0]])).toBe(false);
    expect(isAllPlaceholderSmokeSteps(null)).toBe(false);
  });
});

describe('extractSmokeTestSteps — maps a Demo section (QF-20260529-985)', () => {
  it('extracts numbered items from a "## Demo (30-second...)" section', () => {
    const plan = '# Plan: X\n\n## Demo (30-second human-verifiable outcome)\n\n1. Run the pull job -> a venture_telemetry row appears\n2. Open the dashboard -> the signal is visible\n\n## Risks\n- a risk\n';
    const steps = extractSmokeTestSteps(plan);
    expect(steps).not.toBeNull();
    expect(steps.length).toBe(2);
    expect(steps[0].instruction).toContain('Run the pull job');
    expect(steps[1].instruction).toContain('Open the dashboard');
  });
  it('still matches the legacy "## Smoke Test Steps" heading and strips a "Step N:" prefix', () => {
    const plan = '## Smoke Test Steps\n\n- Step 1: do the thing\n- Step 2: verify the thing\n';
    const steps = extractSmokeTestSteps(plan);
    expect(steps.length).toBe(2);
    expect(steps[0].instruction).toBe('do the thing');
  });
  it('returns null when no smoke/demo section exists', () => {
    expect(extractSmokeTestSteps('## Goal\n\nSome goal text.')).toBeNull();
  });
});

describe('SMOKE_TEST_SPECIFICATION — rejects the generic placeholder for code SDs', () => {
  it('BLOCKS a feature SD whose smoke steps are entirely the auto-generated placeholder', async () => {
    const sd = { sd_type: 'feature', title: 'X', smoke_test_steps: PLACEHOLDER_STEPS };
    const r = await validateSmokeTestSpecification(sd);
    expect(r.pass).toBe(false);
    expect(r.issues.some((i) => /placeholder/i.test(i))).toBe(true);
  });
  it('PASSES a feature SD with real demo steps', async () => {
    const sd = { sd_type: 'feature', title: 'X', smoke_test_steps: REAL_STEPS };
    const r = await validateSmokeTestSpecification(sd);
    expect(r.pass).toBe(true);
  });
});
