/**
 * Integration test: vision-governance score -> classify -> occurrence pipeline
 * SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001
 *
 * Tests the full scoring pipeline from classification through occurrence checking,
 * using corrective-sd-generator.mjs exports (which are the canonical pipeline entry).
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GRADE } from '../../../lib/standards/grade-scale.js';

// Mock dotenv and supabase before importing
vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let classifyScore, THRESHOLDS, MIN_OCCURRENCES, checkMinOccurrences;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
  classifyScore = mod.classifyScore;
  THRESHOLDS = mod.THRESHOLDS;
  MIN_OCCURRENCES = mod.MIN_OCCURRENCES;
  checkMinOccurrences = mod.checkMinOccurrences;
});

describe('vision-governance: score -> classify -> occurrence pipeline', () => {
  it('classifies escalation score correctly', () => {
    const score = 40;
    expect(classifyScore(score)).toBe('escalation');
  });

  it('classifies gap-closure score correctly (C range: 70-82)', () => {
    const score = 75;  // GRADE.C_MINUS ≤ 75 < GRADE.B
    expect(classifyScore(score)).toBe('gap-closure');
  });

  it('classifies minor score correctly (B/A- range: 83-92)', () => {
    const score = 87;  // GRADE.B ≤ 87 < GRADE.A
    expect(classifyScore(score)).toBe('minor');
  });

  it('classifies accept score correctly (A range: 93+)', () => {
    const score = 95;  // ≥ GRADE.A
    expect(classifyScore(score)).toBe('accept');
  });

  it('pipeline threshold alignment: THRESHOLDS align with GRADE constants', () => {
    expect(THRESHOLDS.ACCEPT).toBe(GRADE.A);       // 93
    expect(THRESHOLDS.MINOR).toBe(GRADE.B);        // 83
    expect(THRESHOLDS.GAP_CLOSURE).toBe(GRADE.C_MINUS); // 70
    expect(THRESHOLDS.ESCALATION).toBe(GRADE.F);   // 0
  });

  it('THRESHOLDS.MINOR aligns with GRADE.B (83) after grade-scale alignment', () => {
    expect(THRESHOLDS.MINOR).toBe(GRADE.B);
    expect(THRESHOLDS.MINOR).toBe(83);
  });

  it('checkMinOccurrences dry-run: qualifies when count meets minimum', async () => {
    const mockCount = MIN_OCCURRENCES;
    const mockSupabase = buildChainableMock(mockCount);

    const result = await checkMinOccurrences(mockSupabase, 'SD-VISION-TEST', MIN_OCCURRENCES);
    expect(result.qualifies).toBe(true);
    expect(result.count).toBe(mockCount);
  });

  it('checkMinOccurrences dry-run: does not qualify below minimum', async () => {
    const mockSupabase = buildChainableMock(1);

    const result = await checkMinOccurrences(mockSupabase, 'SD-VISION-TEST', MIN_OCCURRENCES);
    expect(result.qualifies).toBe(false);
    expect(result.count).toBe(1);
  });

  it('end-to-end: full pipeline routes low score to escalation', () => {
    const score = { total_score: 40, threshold_action: 'escalation' };
    const tier = classifyScore(score.total_score);
    expect(tier).toBe('escalation');
    expect(score.total_score).toBeLessThan(THRESHOLDS.GAP_CLOSURE);
    expect(tier).not.toBe('accept');
    expect(tier).not.toBe('minor');
  });

  it('end-to-end: full pipeline routes accept score to no action', () => {
    const score = { total_score: 93, threshold_action: 'accept' };  // GRADE.A
    const tier = classifyScore(score.total_score);
    expect(tier).toBe('accept');
    expect(score.total_score).toBeGreaterThanOrEqual(THRESHOLDS.ACCEPT);
  });

  it('boundary sweep: every integer maps to exactly one tier', () => {
    const tiers = new Set(['accept', 'minor', 'gap-closure', 'escalation']);
    for (let score = 0; score <= 100; score++) {
      const tier = classifyScore(score);
      expect(tiers.has(tier)).toBe(true);
    }
  });

  it('tier boundaries are strictly ordered', () => {
    expect(THRESHOLDS.ESCALATION).toBeLessThan(THRESHOLDS.GAP_CLOSURE);
    expect(THRESHOLDS.GAP_CLOSURE).toBeLessThan(THRESHOLDS.MINOR);
    expect(THRESHOLDS.MINOR).toBeLessThan(THRESHOLDS.ACCEPT);
  });
});

/**
 * Build a chainable Supabase mock using Proxy for the query pattern:
 *   supabase.from().select().lt().eq?().not().not().not() -> { count, error }
 */
function buildChainableMock(count, error = null) {
  const terminal = { count, error };
  const handler = {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve) => resolve(terminal);
      }
      return () => new Proxy({}, handler);
    },
  };
  return { from: () => new Proxy({}, handler) };
}
