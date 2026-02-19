/**
 * Regression Guard: Vision Gate Return Schema
 * SD-LEARN-FIX-ADDRESS-PAT-AUTO-024
 *
 * Addresses PAT-AUTO-38e382e3: GATE_VISION_SCORE failed score 0/100 due to
 * gate returning {valid: boolean} instead of {passed: boolean, maxScore: number}.
 *
 * Root cause was fixed in PR #1410 (SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001).
 * These tests guard against regression back to the {valid} schema.
 *
 * gate-result-schema.js requires ALL gates to return:
 *   { passed: boolean, score: number, maxScore: number }
 */

import { describe, it, expect, vi } from 'vitest';
import { validateVisionScore } from '../../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';

/** Build a minimal Supabase stub returning the provided rows from eva_vision_scores */
function makeSupabase(scoreRows = []) {
  const chain = {
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: scoreRows, error: null }),
  };
  return {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(chain) }),
  };
}

const SD_INFRA = { sd_key: 'SD-TEST-001', sd_type: 'infrastructure' };

describe('validateVisionScore — gate-result-schema.js contract (PAT-AUTO-38e382e3)', () => {
  it('US-001: returns {passed, score, maxScore} when score meets threshold', async () => {
    const supabase = makeSupabase([{ total_score: 85, threshold_action: 'accept', dimension_scores: null, scored_at: new Date().toISOString() }]);
    const result = await validateVisionScore(SD_INFRA, supabase);

    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('score');
    expect(result).toHaveProperty('maxScore');
    expect(typeof result.passed).toBe('boolean');
    expect(typeof result.score).toBe('number');
    expect(typeof result.maxScore).toBe('number');
    expect(result.passed).toBe(true);
    expect(result.maxScore).toBe(100);
  });

  it('US-001: returns {passed: false, score: 0, maxScore: 100} when no score found', async () => {
    const supabase = makeSupabase([]); // no rows
    const result = await validateVisionScore({ sd_key: 'SD-NO-SCORE-001', sd_type: 'infrastructure' }, supabase);

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.maxScore).toBe(100);
  });

  it('US-001: returns {passed: false} when score below threshold', async () => {
    const supabase = makeSupabase([{ total_score: 50, threshold_action: 'escalate', dimension_scores: null, scored_at: new Date().toISOString() }]);
    // Also mock validation_gate_registry lookup (no override)
    const supabaseWithRegistry = {
      from: vi.fn((table) => {
        if (table === 'eva_vision_scores') {
          const chain = { eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [{ total_score: 50, threshold_action: 'escalate', dimension_scores: null, scored_at: new Date().toISOString() }] }) };
          return { select: vi.fn().mockReturnValue(chain) };
        }
        // validation_gate_registry — no override
        const chain = { eq: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
        return { select: vi.fn().mockReturnValue(chain) };
      }),
    };
    const result = await validateVisionScore(SD_INFRA, supabaseWithRegistry);

    expect(result.passed).toBe(false);
    expect(result.maxScore).toBe(100);
  });

  it('US-001: return object NEVER contains a "valid" field', async () => {
    const supabase = makeSupabase([{ total_score: 85, threshold_action: 'accept', dimension_scores: null, scored_at: new Date().toISOString() }]);
    const result = await validateVisionScore(SD_INFRA, supabase);

    expect(Object.keys(result)).not.toContain('valid');
  });

  it('US-001: return object NEVER contains "valid" even on block path', async () => {
    const result = await validateVisionScore({ sd_key: 'SD-NULL-001', sd_type: 'feature' }, null);

    expect(Object.keys(result)).not.toContain('valid');
  });
});
