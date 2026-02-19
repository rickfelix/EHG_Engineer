/**
 * Unit Tests: Vision Score Gate (Hard Enforcement)
 * SD: SD-MAN-INFRA-VISION-SCORE-GATE-HARDEN-001
 *
 * Covers: SD_TYPE_THRESHOLDS map, blocking behavior, dimension warnings,
 *         override mechanism, createVisionScoreGate factory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateVisionScore,
  createVisionScoreGate,
  SD_TYPE_THRESHOLDS,
  DIMENSION_WARNING_THRESHOLD,
} from '../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal SD object for testing. */
function makeSD(sdKey, sdType, visionScore = null, dimensionScores = null) {
  return {
    sd_key: sdKey,
    sd_type: sdType,
    vision_score: visionScore,
    vision_score_action: visionScore !== null ? (visionScore >= 93 ? 'accept' : visionScore >= 83 ? 'minor_sd' : 'gap_closure_sd') : null,
    dimension_scores: dimensionScores,
  };
}

/** Build a Supabase stub that returns a specific vision score record. */
function makeSupabaseWithScore(totalScore, dimensionScores = null, thresholdAction = null) {
  const record = totalScore !== null
    ? [{ total_score: totalScore, threshold_action: thresholdAction || 'accept', dimension_scores: dimensionScores, scored_at: new Date().toISOString() }]
    : [];

  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: record }),
    }),
  };
}

/** Build a Supabase stub that returns an override row. */
function makeSupabaseWithOverride(justification) {
  let callCount = 0;
  return {
    from: vi.fn().mockImplementation((table) => {
      callCount++;
      // First call: eva_vision_scores → return low score to trigger threshold check
      // Override call: validation_gate_registry → return override
      if (table === 'eva_vision_scores') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [{ total_score: 40, threshold_action: 'escalate', dimension_scores: null, scored_at: new Date().toISOString() }] }),
        };
      }
      // validation_gate_registry
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: justification ? [{ justification }] : [] }),
      };
    }),
  };
}

/** Supabase stub that throws on every call (simulates DB error). */
function makeFailingSupabase() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('DB error')),
    }),
  };
}

// ─── Tests: SD_TYPE_THRESHOLDS map ────────────────────────────────────────────

describe('SD_TYPE_THRESHOLDS', () => {
  it('tier-1 types require 90', () => {
    expect(SD_TYPE_THRESHOLDS.feature).toBe(90);
    expect(SD_TYPE_THRESHOLDS.governance).toBe(90);
    expect(SD_TYPE_THRESHOLDS.security).toBe(90);
  });

  it('tier-2 types require 80', () => {
    expect(SD_TYPE_THRESHOLDS.infrastructure).toBe(80);
    expect(SD_TYPE_THRESHOLDS.enhancement).toBe(80);
  });

  it('tier-3 types require 70', () => {
    for (const t of ['maintenance', 'protocol', 'bugfix', 'fix', 'documentation', 'refactor', 'orchestrator']) {
      expect(SD_TYPE_THRESHOLDS[t]).toBe(70);
    }
  });

  it('default threshold is 80', () => {
    expect(SD_TYPE_THRESHOLDS._default).toBe(80);
  });
});

// ─── Tests: No vision score → hard block ──────────────────────────────────────

describe('validateVisionScore — no score present', () => {
  it('blocks when SD has no cached score and DB returns nothing', async () => {
    const sd = makeSD('SD-TEST-001', 'feature');
    const supabase = makeSupabaseWithScore(null);

    const result = await validateVisionScore(sd, supabase);

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toMatch(/no vision alignment score/i);
    expect(result.remediation).toMatch(/vision-scorer\.js/);
  });

  it('blocks when supabase is null and no cached score', async () => {
    const sd = makeSD('SD-TEST-002', 'infrastructure');
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });

  it('blocks when DB throws and no cached score', async () => {
    const sd = makeSD('SD-TEST-003', 'infrastructure');
    const result = await validateVisionScore(sd, makeFailingSupabase());

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
  });
});

// ─── Tests: Score below threshold → hard block ────────────────────────────────

describe('validateVisionScore — score below threshold', () => {
  it('blocks feature SD at score=89 (threshold=90)', async () => {
    const sd = makeSD('SD-TEST-004', 'feature', 89);

    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.details).toMatch(/89.+90/);
    expect(result.remediation).toMatch(/vision-scorer/);
  });

  it('blocks infrastructure SD at score=79 (threshold=80)', async () => {
    const sd = makeSD('SD-TEST-005', 'infrastructure', 79);
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(false);
    expect(result.details).toMatch(/79.+80/);
  });

  it('blocks fix SD at score=69 (threshold=70)', async () => {
    const sd = makeSD('SD-TEST-006', 'fix', 69);
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(false);
    expect(result.details).toMatch(/69.+70/);
  });

  it('unknown sd_type defaults to threshold=80, blocks at 79', async () => {
    const sd = makeSD('SD-TEST-007', 'custom_unknown', 79);
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(false);
  });
});

// ─── Tests: Score at or above threshold → passes ─────────────────────────────

describe('validateVisionScore — score meets threshold', () => {
  it('passes feature SD at exactly 90', async () => {
    const sd = makeSD('SD-TEST-008', 'feature', 90);
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(true);
    expect(result.score).toBe(100);
  });

  it('passes infrastructure SD at exactly 80 (boundary)', async () => {
    const sd = makeSD('SD-TEST-009', 'infrastructure', 80);
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(true);
  });

  it('passes fix SD at exactly 70', async () => {
    const sd = makeSD('SD-TEST-010', 'fix', 70);
    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(true);
  });

  it('prefers cached score over DB lookup', async () => {
    const sd = makeSD('SD-TEST-011', 'infrastructure', 85); // cached=85 (passes)
    const supabase = makeSupabaseWithScore(40); // DB would return 40 (fails)

    const result = await validateVisionScore(sd, supabase);

    // Should use cached 85, not DB 40
    expect(result.valid).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled(); // never hit DB
  });
});

// ─── Tests: Per-dimension warnings ────────────────────────────────────────────

describe('validateVisionScore — per-dimension warnings', () => {
  it('emits warning for dimension below 75 when overall score passes', async () => {
    const dims = { strategic_alignment: 70, innovation: 80 };
    const sd = makeSD('SD-TEST-012', 'feature', 92, dims);

    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/strategic_alignment/);
    expect(result.warnings[0]).toMatch(/70/);
  });

  it('emits multiple warnings when multiple dimensions fail', async () => {
    const dims = { dim_a: 60, dim_b: 70, dim_c: 90 };
    const sd = makeSD('SD-TEST-013', 'feature', 95, dims);

    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(2);
  });

  it('no warnings when all dimensions >= 75', async () => {
    const dims = { dim_a: 75, dim_b: 90, dim_c: 100 };
    const sd = makeSD('SD-TEST-014', 'feature', 95, dims);

    const result = await validateVisionScore(sd, null);

    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  it('DIMENSION_WARNING_THRESHOLD is 75', () => {
    expect(DIMENSION_WARNING_THRESHOLD).toBe(75);
  });
});

// ─── Tests: Override mechanism ────────────────────────────────────────────────

describe('validateVisionScore — Chairman override', () => {
  it('override with non-empty justification bypasses hard block', async () => {
    const sd = makeSD('SD-TEST-015', 'feature'); // no cached score → DB returns 40
    const supabase = makeSupabaseWithOverride('Approved by Chairman for strategic priority Q1');

    const result = await validateVisionScore(sd, supabase);

    expect(result.valid).toBe(true);
    expect(result.details).toMatch(/overridden/i);
    expect(result.details).toMatch(/chairman/i);
  });

  it('override with empty justification does NOT bypass block', async () => {
    const sd = makeSD('SD-TEST-016', 'feature');
    const supabase = makeSupabaseWithOverride(''); // empty = not accepted

    const result = await validateVisionScore(sd, supabase);

    expect(result.valid).toBe(false);
  });

  it('override does not apply when score already passes threshold', async () => {
    // Score 95 already passes feature threshold 90 — override irrelevant
    const sd = makeSD('SD-TEST-017', 'feature', 95);
    const supabase = makeSupabaseWithOverride('Some justification');

    const result = await validateVisionScore(sd, supabase);

    // Valid because score passes, not because of override
    expect(result.valid).toBe(true);
    expect(result.details).not.toMatch(/overridden/i);
  });

  it('override query failure (DB error) is fail-closed — gate still enforces', async () => {
    // SD score too low, override DB throws → should still block
    const sd = makeSD('SD-TEST-018', 'feature', 50);
    const failSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    };

    const result = await validateVisionScore(sd, failSupabase);

    expect(result.valid).toBe(false);
  });
});

// ─── Tests: createVisionScoreGate factory ─────────────────────────────────────

describe('createVisionScoreGate', () => {
  it('returns a gate with required=true (hard gate)', () => {
    const gate = createVisionScoreGate(null);
    expect(gate.required).toBe(true);
  });

  it('gate name is GATE_VISION_SCORE', () => {
    const gate = createVisionScoreGate(null);
    expect(gate.name).toBe('GATE_VISION_SCORE');
  });

  it('validator calls validateVisionScore via ctx.sd', async () => {
    const sd = makeSD('SD-TEST-019', 'infrastructure', 85);
    const gate = createVisionScoreGate(null);

    const result = await gate.validator({ sd });

    expect(result.valid).toBe(true);
  });

  it('remediation message contains vision-scorer.js', () => {
    const gate = createVisionScoreGate(null);
    expect(gate.remediation).toMatch(/vision-scorer\.js/);
  });
});
