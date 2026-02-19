/**
 * Tests for Corrective SD Generator: classifyScore, checkMinOccurrences, THRESHOLDS
 * SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { GRADE } from '../../../lib/standards/grade-scale.js';

// Mock dotenv and supabase before importing the module
vi.mock('dotenv', () => ({ config: vi.fn(), default: { config: vi.fn() } }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({})) }));

let classifyScore, THRESHOLDS, checkMinOccurrences, MIN_OCCURRENCES;

beforeAll(async () => {
  const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
  classifyScore = mod.classifyScore;
  THRESHOLDS = mod.THRESHOLDS;
  checkMinOccurrences = mod.checkMinOccurrences;
  MIN_OCCURRENCES = mod.MIN_OCCURRENCES;
});

describe('corrective-sd-generator: classifyScore', () => {
  it('classifies score 100 as accept', () => {
    expect(classifyScore(100)).toBe('accept');
  });

  it('classifies score 93 (GRADE.A = THRESHOLDS.ACCEPT boundary) as accept', () => {
    expect(classifyScore(GRADE.A)).toBe('accept');
  });

  it('classifies score 92 (ACCEPT - 1) as minor', () => {
    expect(classifyScore(GRADE.A - 1)).toBe('minor');
  });

  it('classifies score 83 (GRADE.B = THRESHOLDS.MINOR boundary) as minor', () => {
    expect(classifyScore(GRADE.B)).toBe('minor');
  });

  it('classifies score 82 (MINOR - 1) as gap-closure', () => {
    expect(classifyScore(GRADE.B - 1)).toBe('gap-closure');
  });

  it('classifies score 70 (GRADE.C_MINUS = THRESHOLDS.GAP_CLOSURE boundary) as gap-closure', () => {
    expect(classifyScore(GRADE.C_MINUS)).toBe('gap-closure');
  });

  it('classifies score 69 (GAP_CLOSURE - 1) as escalation', () => {
    expect(classifyScore(GRADE.C_MINUS - 1)).toBe('escalation');
  });

  it('classifies score 0 as escalation', () => {
    expect(classifyScore(0)).toBe('escalation');
  });
});

describe('corrective-sd-generator: THRESHOLDS', () => {
  it('THRESHOLDS.ACCEPT equals GRADE.A (93)', () => {
    expect(THRESHOLDS.ACCEPT).toBe(GRADE.A);
    expect(THRESHOLDS.ACCEPT).toBe(93);
  });

  it('THRESHOLDS.MINOR equals GRADE.B (83)', () => {
    expect(THRESHOLDS.MINOR).toBe(GRADE.B);
    expect(THRESHOLDS.MINOR).toBe(83);
  });

  it('THRESHOLDS.GAP_CLOSURE equals GRADE.C_MINUS (70)', () => {
    expect(THRESHOLDS.GAP_CLOSURE).toBe(GRADE.C_MINUS);
    expect(THRESHOLDS.GAP_CLOSURE).toBe(70);
  });

  it('THRESHOLDS.ESCALATION is 0 (GRADE.F)', () => {
    expect(THRESHOLDS.ESCALATION).toBe(GRADE.F);
    expect(THRESHOLDS.ESCALATION).toBe(0);
  });

  it('THRESHOLDS.MINOR equals GRADE.C_MINUS (70) — wait, now equals GRADE.B (83)', () => {
    // After grade-scale alignment: MINOR uses GRADE.B not GRADE.C_MINUS
    expect(THRESHOLDS.MINOR).toBe(GRADE.B);
  });

  it('THRESHOLDS.ACCEPT equals GRADE.A (93) — aligned', () => {
    expect(THRESHOLDS.ACCEPT).toBe(GRADE.A);
    expect(THRESHOLDS.ACCEPT).toBe(93);
  });

  it('THRESHOLDS.ESCALATION equals GRADE.F (0)', () => {
    expect(THRESHOLDS.ESCALATION).toBe(GRADE.F);
  });
});

describe('corrective-sd-generator: MIN_OCCURRENCES', () => {
  it('MIN_OCCURRENCES is 2', () => {
    expect(MIN_OCCURRENCES).toBe(2);
  });
});

describe('corrective-sd-generator: checkMinOccurrences', () => {
  /**
   * Build a chainable Supabase mock for the query pattern used by checkMinOccurrences.
   * Uses Proxy so every chained method returns the proxy, and await resolves to terminal.
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

  it('returns qualifies:false when count < MIN_OCCURRENCES', async () => {
    const mockSupabase = buildChainableMock(1);
    const result = await checkMinOccurrences(mockSupabase, 'SD-TEST', 2);
    expect(result.qualifies).toBe(false);
    expect(result.count).toBe(1);
  });

  it('returns qualifies:true when count >= MIN_OCCURRENCES', async () => {
    const mockSupabase = buildChainableMock(2);
    const result = await checkMinOccurrences(mockSupabase, 'SD-TEST', 2);
    expect(result.qualifies).toBe(true);
    expect(result.count).toBe(2);
  });

  it('returns qualifies:true when count exceeds MIN_OCCURRENCES', async () => {
    const mockSupabase = buildChainableMock(5);
    const result = await checkMinOccurrences(mockSupabase, 'SD-TEST', 2);
    expect(result.qualifies).toBe(true);
    expect(result.count).toBe(5);
  });

  it('defaults to qualify on Supabase error', async () => {
    const mockSupabase = buildChainableMock(null, { message: 'connection refused' });
    const result = await checkMinOccurrences(mockSupabase, 'SD-TEST', 2);
    expect(result.qualifies).toBe(true);
    expect(result.count).toBe(MIN_OCCURRENCES);
  });

  it('handles null sdId (portfolio-level check)', async () => {
    const mockSupabase = buildChainableMock(3);
    const result = await checkMinOccurrences(mockSupabase, null, 2);
    expect(result.qualifies).toBe(true);
    expect(result.count).toBe(3);
  });

  it('uses default minOccurrences when not specified', async () => {
    const mockSupabase = buildChainableMock(MIN_OCCURRENCES);
    const result = await checkMinOccurrences(mockSupabase, 'SD-TEST');
    expect(result.qualifies).toBe(true);
    expect(result.count).toBe(MIN_OCCURRENCES);
  });
});
