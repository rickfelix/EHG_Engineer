/**
 * Canonical learning_category allowlist + normalizer — SD-FDBK-INFRA-RETROSPECTIVES-CHECK-LEARNING-001.
 *
 * The retrospectives.check_learning_category CHECK accepts exactly 9 values; plausible near-misses
 * (PROTOCOL_PROCESS, CI_CD, TOOLING, WORKFLOW, CONFIGURATION, OTHER, ...) are rejected. These tests pin
 * that normalizeLearningCategory coerces any input to a constraint-valid value so a retro never fails.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { LEARNING_CATEGORIES, DEFAULT_LEARNING_CATEGORY, normalizeLearningCategory } = require('../../lib/retro/learning-category.cjs');

describe('LEARNING_CATEGORIES', () => {
  it('is the exact 9-value constraint set', () => {
    expect([...LEARNING_CATEGORIES].sort()).toEqual([
      'APPLICATION_ISSUE', 'DATABASE_SCHEMA', 'DEPLOYMENT_ISSUE', 'DOCUMENTATION',
      'PERFORMANCE_OPTIMIZATION', 'PROCESS_IMPROVEMENT', 'SECURITY_VULNERABILITY',
      'TESTING_STRATEGY', 'USER_EXPERIENCE',
    ].sort());
  });
  it('the default is itself a valid category', () => {
    expect(LEARNING_CATEGORIES).toContain(DEFAULT_LEARNING_CATEGORY);
  });
});

describe('normalizeLearningCategory', () => {
  it('returns already-valid values unchanged', () => {
    for (const c of LEARNING_CATEGORIES) expect(normalizeLearningCategory(c)).toBe(c);
  });

  it('maps the plausible-but-rejected guesses to the nearest valid value', () => {
    expect(normalizeLearningCategory('PROTOCOL_PROCESS')).toBe('PROCESS_IMPROVEMENT');
    expect(normalizeLearningCategory('PROCESS')).toBe('PROCESS_IMPROVEMENT');
    expect(normalizeLearningCategory('INFRASTRUCTURE')).toBe('PROCESS_IMPROVEMENT');
    expect(normalizeLearningCategory('TOOLING')).toBe('PROCESS_IMPROVEMENT');
    expect(normalizeLearningCategory('WORKFLOW')).toBe('PROCESS_IMPROVEMENT');
    expect(normalizeLearningCategory('CONFIGURATION')).toBe('PROCESS_IMPROVEMENT');
    expect(normalizeLearningCategory('CI_CD')).toBe('DEPLOYMENT_ISSUE');
  });

  it('is case- and separator-insensitive', () => {
    expect(normalizeLearningCategory('ci/cd')).toBe('DEPLOYMENT_ISSUE');
    expect(normalizeLearningCategory('  Ci-Cd  ')).toBe('DEPLOYMENT_ISSUE');
    expect(normalizeLearningCategory('application_issue')).toBe('APPLICATION_ISSUE');
    expect(normalizeLearningCategory('database schema')).toBe('DATABASE_SCHEMA');
  });

  it('maps domain aliases sensibly', () => {
    expect(normalizeLearningCategory('test')).toBe('TESTING_STRATEGY');
    expect(normalizeLearningCategory('migration')).toBe('DATABASE_SCHEMA');
    expect(normalizeLearningCategory('perf')).toBe('PERFORMANCE_OPTIMIZATION');
    expect(normalizeLearningCategory('auth')).toBe('SECURITY_VULNERABILITY');
    expect(normalizeLearningCategory('docs')).toBe('DOCUMENTATION');
    expect(normalizeLearningCategory('ux')).toBe('USER_EXPERIENCE');
  });

  it('falls back to the default for unknown/empty/non-string input', () => {
    expect(normalizeLearningCategory('OTHER')).toBe(DEFAULT_LEARNING_CATEGORY);
    expect(normalizeLearningCategory('zzz-unknown')).toBe(DEFAULT_LEARNING_CATEGORY);
    expect(normalizeLearningCategory('')).toBe(DEFAULT_LEARNING_CATEGORY);
    expect(normalizeLearningCategory(null)).toBe(DEFAULT_LEARNING_CATEGORY);
    expect(normalizeLearningCategory(undefined)).toBe(DEFAULT_LEARNING_CATEGORY);
    expect(normalizeLearningCategory(42)).toBe(DEFAULT_LEARNING_CATEGORY);
  });

  it('ALWAYS returns a constraint-valid value', () => {
    for (const input of ['PROTOCOL_PROCESS', 'CI_CD', 'OTHER', '', null, 'random', 'TOOLING', 'security']) {
      expect(LEARNING_CATEGORIES).toContain(normalizeLearningCategory(input));
    }
  });
});
