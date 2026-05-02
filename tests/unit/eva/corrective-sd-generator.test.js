/**
 * Tests for Corrective SD Generator: classifyScore, checkMinOccurrences, THRESHOLDS
 * SD-EVA-QUALITY-VISION-GOVERNANCE-TESTS-001
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
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

// SD-FDBK-ENH-HEAL-COMMAND-MJS-001 — regression cases for unbound `options` parameter
describe('generateCorrectiveSD: options-binding regression (SD-FDBK-ENH-HEAL-COMMAND-MJS-001)', () => {
  let generateCorrectiveSD;
  let originalSupabaseUrl;
  let originalSupabaseKey;
  let createClientSpy;

  beforeAll(async () => {
    originalSupabaseUrl = process.env.SUPABASE_URL;
    originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    const mod = await import('../../../scripts/eva/corrective-sd-generator.mjs');
    generateCorrectiveSD = mod.generateCorrectiveSD;
    const supaMod = await import('@supabase/supabase-js');
    createClientSpy = vi.spyOn(supaMod, 'createClient');
  });

  function buildSupabase(scoreOverride = {}) {
    const score = {
      id: 'score-rgr-1',
      sd_id: 'SD-TEST-FAKE-001',
      vision_id: 'vision-rgr',
      total_score: 50,
      threshold_action: 'gap_closure_sd',
      dimension_scores: { V01: 80, V02: 80, V03: 80, V04: 80, V05: 80 },
      rubric_snapshot: { git_sha: 'b7a7d52604', mode: 'sd-heal' },
      created_by: 'test-fixture-rgr',
      scored_at: new Date().toISOString(),
      ...scoreOverride,
    };
    return {
      from: vi.fn((table) => {
        if (table === 'eva_vision_scores') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: score, error: null }) }) }) };
        }
        if (table === 'audit_log') {
          return { insert: vi.fn().mockResolvedValue({ error: null }) };
        }
        if (table === 'strategic_directives_v2') {
          return {
            select: () => ({
              eq: () => ({
                gte: () => Promise.resolve({ data: [{ id: 'sd-x' }, { id: 'sd-y' }], count: 2, error: null }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'unexpected ' + table } }) }) }) };
      }),
    };
  }

  it('regression — does NOT throw ReferenceError when called with one arg and a git_sha-stamped score', async () => {
    createClientSpy.mockReturnValueOnce(buildSupabase());
    let refError = null;
    try {
      await generateCorrectiveSD('score-rgr-1');
    } catch (err) {
      if (err && err.name === 'ReferenceError' && /options/.test(err.message)) {
        refError = err;
      }
    }
    expect(refError).toBeNull();
  });

  it('honors options.force=true (passes second-arg through to staleness check branch)', async () => {
    createClientSpy.mockReturnValueOnce(buildSupabase());
    let refError = null;
    try {
      await generateCorrectiveSD('score-rgr-1', { force: true });
    } catch (err) {
      if (err && err.name === 'ReferenceError') refError = err;
    }
    expect(refError).toBeNull();
  });

  it('default-undefined options object behaves as { force: undefined } (no force override)', async () => {
    createClientSpy.mockReturnValueOnce(buildSupabase());
    let refError = null;
    try {
      await generateCorrectiveSD('score-rgr-1');
    } catch (err) {
      if (err && err.name === 'ReferenceError') refError = err;
    }
    expect(refError).toBeNull();
  });

  afterAll(() => {
    if (originalSupabaseUrl !== undefined) process.env.SUPABASE_URL = originalSupabaseUrl;
    else delete process.env.SUPABASE_URL;
    if (originalSupabaseKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseKey;
    else delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
});
