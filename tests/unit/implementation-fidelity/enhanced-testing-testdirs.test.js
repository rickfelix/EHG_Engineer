/**
 * F21 (367cab56): GATE2 Section D [D1] test discovery must scan the bare
 * `tests/` root so backend/venture slices that place tests in `tests/` (not
 * `tests/unit`) have their unit/integration coverage counted toward D1 instead
 * of a false "No E2E tests found" 0/20. Witnessed: CronGenius Child C (GATE2 83
 * YELLOW). Broadening is additive — it can only reduce false negatives.
 */
import { describe, it, expect } from 'vitest';
import { TEST_DIRS } from '../../../scripts/modules/implementation-fidelity/sections/enhanced-testing.js';

describe('enhanced-testing TEST_DIRS (F21 367cab56)', () => {
  it('scans the bare tests/ root so unit/integration coverage counts toward D1', () => {
    expect(TEST_DIRS).toContain('tests');
  });

  it('retains top-level e2e and playwright dirs', () => {
    expect(TEST_DIRS).toContain('e2e');
    expect(TEST_DIRS).toContain('playwright/tests');
  });

  it('drops the redundant tests/* subdirs (tests/ recursive subsumes them)', () => {
    // readdir(tests/, { recursive: true }) reaches tests/e2e|integration|unit,
    // so listing them separately would only double-count.
    expect(TEST_DIRS).not.toContain('tests/unit');
    expect(TEST_DIRS).not.toContain('tests/e2e');
    expect(TEST_DIRS).not.toContain('tests/integration');
  });
});
