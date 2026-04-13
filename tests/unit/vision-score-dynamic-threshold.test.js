/**
 * Unit Tests: Dynamic Vision Threshold, Floor Rule, and Audit Logging
 * SD: SD-CONTEXTAWARE-VISION-SCORING-DYNAMIC-ORCH-001-A
 *
 * Tests the new dynamic threshold adjustment, floor rule enforcement,
 * and audit logging features added to the vision score gate.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateVisionScore,
  SD_TYPE_THRESHOLDS,
  SD_TYPE_ADDRESSABLE_DIMENSIONS,
  MIN_ADDRESSABLE_DIMENSIONS,
  FLOOR_MINIMUM_SCORE,
  countAddressableDimensions,
  calculateDynamicThreshold,
} from '../../scripts/modules/handoff/executors/lead-to-plan/gates/vision-score.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSD(sdKey, sdType, visionScore = null, dimensionScores = null) {
  return {
    sd_key: sdKey,
    sd_type: sdType,
    vision_score: visionScore,
    vision_score_action: visionScore !== null ? (visionScore >= 93 ? 'accept' : visionScore >= 83 ? 'minor_sd' : 'gap_closure_sd') : null,
    dimension_scores: dimensionScores,
  };
}

/** Build a Supabase stub that captures audit log inserts. */
function makeAuditCapturingSupabase(auditInserts = []) {
  return {
    from: vi.fn().mockImplementation((table) => {
      if (table === 'vision_scoring_audit_log') {
        return {
          insert: vi.fn().mockImplementation((data) => {
            auditInserts.push(data);
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      // Default: return empty results for other tables
      const obj = {
        select: () => obj,
        eq: () => obj,
        order: () => obj,
        limit: () => Promise.resolve({ data: [] }),
      };
      return obj;
    }),
  };
}

// ─── Tests: countAddressableDimensions ───────────────────────────────────────

describe('countAddressableDimensions', () => {
  it('returns all dims addressable for feature type (null mapping)', () => {
    const dims = { strategic_alignment: 90, innovation: 85, reliability: 80, accessibility: 75, ui_ux: 70 };
    const result = countAddressableDimensions('feature', dims);
    expect(result.addressable).toBe(5);
    expect(result.total).toBe(5);
  });

  it('returns subset for infrastructure type', () => {
    const dims = {
      architecture: 90,
      reliability: 80,
      scalability: 75,
      accessibility: 70, // not addressable by infrastructure
      ui_ux: 60,          // not addressable
      security: 85,
    };
    const result = countAddressableDimensions('infrastructure', dims);
    expect(result.addressable).toBe(4); // architecture, reliability, scalability, security
    expect(result.total).toBe(6);
  });

  it('returns subset for documentation type', () => {
    const dims = {
      documentation: 90,
      knowledge: 85,
      architecture: 80,
      ui_ux: 70,
      scalability: 60,
    };
    const result = countAddressableDimensions('documentation', dims);
    expect(result.addressable).toBe(2); // documentation, knowledge
    expect(result.total).toBe(5);
  });

  it('returns 0/0 for null dimension scores', () => {
    const result = countAddressableDimensions('feature', null);
    expect(result.addressable).toBe(0);
    expect(result.total).toBe(0);
  });

  it('handles unknown sd_type with no mapping (all addressable)', () => {
    const dims = { dim_a: 90, dim_b: 80 };
    const result = countAddressableDimensions('unknown_type', dims);
    // undefined mapping => all addressable
    expect(result.addressable).toBe(2);
    expect(result.total).toBe(2);
  });
});

// ─── Tests: calculateDynamicThreshold ────────────────────────────────────────

describe('calculateDynamicThreshold', () => {
  it('returns base threshold when all dims addressable', () => {
    expect(calculateDynamicThreshold(80, 10, 10)).toBe(80);
  });

  it('scales threshold proportionally', () => {
    // 80 * (4/10) = 32
    expect(calculateDynamicThreshold(80, 4, 10)).toBe(32);
  });

  it('rounds to nearest integer', () => {
    // 90 * (3/7) = 38.57... → 39
    expect(calculateDynamicThreshold(90, 3, 7)).toBe(39);
  });

  it('returns base threshold when total is 0', () => {
    expect(calculateDynamicThreshold(80, 0, 0)).toBe(80);
  });

  it('returns base threshold when addressable >= total', () => {
    expect(calculateDynamicThreshold(80, 12, 10)).toBe(80);
  });
});

// ─── Tests: Dynamic threshold in validateVisionScore ────────────────────────

describe('validateVisionScore — dynamic threshold', () => {
  it('infrastructure SD with 4/8 addressable dims uses adjusted threshold', async () => {
    const dims = {
      architecture: 80, reliability: 75, scalability: 70, security: 80,
      accessibility: 30, ui_ux: 20, innovation: 25, market_fit: 15,
    };
    // Base threshold: 80. Addressable: 4/8 → adjusted: 40
    // Vision score: 45 → passes adjusted threshold 40
    const sd = makeSD('SD-DYN-001', 'infrastructure', 45, dims);
    const result = await validateVisionScore(sd, null);

    expect(result.passed).toBe(true);
    expect(result.details).toMatch(/adjusted from 80/);
  });

  it('infrastructure SD fails when below adjusted threshold', async () => {
    const dims = {
      architecture: 80, reliability: 75, scalability: 70, security: 80,
      accessibility: 30, ui_ux: 20, innovation: 25, market_fit: 15,
    };
    // Adjusted threshold: 40. Score: 35 → fails
    const sd = makeSD('SD-DYN-002', 'infrastructure', 35, dims);
    const result = await validateVisionScore(sd, null);

    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/35.*40/);
  });

  it('feature SD with all dims addressable uses base threshold unchanged', async () => {
    const dims = { strategic: 92, innovation: 91, reliability: 90, quality: 93 };
    const sd = makeSD('SD-DYN-003', 'feature', 91, dims);
    const result = await validateVisionScore(sd, null);

    expect(result.passed).toBe(true);
    expect(result.details).not.toMatch(/adjusted from/);
  });

  it('full-dimension SD uses original base threshold (backward compat)', async () => {
    const dims = { dim_a: 85, dim_b: 80, dim_c: 75 };
    // feature type: null mapping → all addressable → no adjustment
    const sd = makeSD('SD-DYN-004', 'feature', 89, dims);
    const result = await validateVisionScore(sd, null);

    // 89 < 90 (feature threshold) → should fail
    expect(result.passed).toBe(false);
  });
});

// ─── Tests: Floor rule ──────────────────────────────────────────────────────

describe('validateVisionScore — floor rule', () => {
  it('flags human review when <3 addressable dims', async () => {
    const dims = {
      documentation: 90, knowledge: 85,
      architecture: 70, scalability: 60, ui_ux: 50,
      innovation: 40, reliability: 30, security: 20,
    };
    // documentation type: only 'documentation' and 'knowledge' match → 2 addressable
    const sd = makeSD('SD-FLOOR-001', 'documentation', 80, dims);
    const result = await validateVisionScore(sd, null);

    expect(result.passed).toBe(true);
    expect(result.score).toBe(75); // reduced score for floor rule
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/floor rule/i);
  });

  it('blocks when addressable dim average < 60', async () => {
    const dims = {
      reliability: 50, quality: 55, security: 45, performance: 50,
      architecture: 80, ui_ux: 90, innovation: 85, documentation: 75,
    };
    // bugfix type: reliability, quality, performance, security → 4 addressable
    // avg of addressable: (50+55+45+50)/4 = 50 → below floor of 60
    const sd = makeSD('SD-FLOOR-002', 'bugfix', 65, dims);
    const result = await validateVisionScore(sd, null);

    expect(result.passed).toBe(false);
    expect(result.details).toMatch(/floor rule/i);
    expect(result.details).toMatch(/50.*60/);
  });

  it('passes when addressable dim average >= 60', async () => {
    const dims = {
      reliability: 70, quality: 65, security: 60, performance: 65,
      architecture: 30, ui_ux: 20, innovation: 15, documentation: 10,
    };
    // bugfix type: 4 addressable, avg = (70+65+60+65)/4 = 65 >= 60
    // Dynamic threshold: 70 * (4/8) = 35. Score: 45 → passes 35
    const sd = makeSD('SD-FLOOR-003', 'bugfix', 45, dims);
    const result = await validateVisionScore(sd, null);

    expect(result.passed).toBe(true);
  });

  it('MIN_ADDRESSABLE_DIMENSIONS is 3', () => {
    expect(MIN_ADDRESSABLE_DIMENSIONS).toBe(3);
  });

  it('FLOOR_MINIMUM_SCORE is 60', () => {
    expect(FLOOR_MINIMUM_SCORE).toBe(60);
  });
});

// ─── Tests: Audit logging ───────────────────────────────────────────────────

describe('validateVisionScore — audit logging', () => {
  it('logs gate evaluation on pass', async () => {
    const auditInserts = [];
    const supabase = makeAuditCapturingSupabase(auditInserts);
    const dims = { architecture: 90, reliability: 85 };
    const sd = makeSD('SD-AUDIT-001', 'feature', 95, dims);

    await validateVisionScore(sd, supabase);

    expect(auditInserts.length).toBe(1);
    expect(auditInserts[0].sd_id).toBe('SD-AUDIT-001');
    expect(auditInserts[0].verdict).toBe('pass');
    expect(auditInserts[0].score).toBe(95);
    expect(auditInserts[0].base_threshold).toBe(90);
  });

  it('logs gate evaluation on blocked (no score)', async () => {
    const auditInserts = [];
    const supabase = makeAuditCapturingSupabase(auditInserts);
    const sd = makeSD('SD-AUDIT-002', 'infrastructure');

    await validateVisionScore(sd, supabase);

    expect(auditInserts.length).toBe(1);
    expect(auditInserts[0].verdict).toBe('blocked_no_score');
    expect(auditInserts[0].score).toBeNull();
  });

  it('logs floor rule triggered flag', async () => {
    const auditInserts = [];
    const supabase = makeAuditCapturingSupabase(auditInserts);
    const dims = {
      documentation: 90, knowledge: 85,
      architecture: 70, scalability: 60, ui_ux: 50,
    };
    const sd = makeSD('SD-AUDIT-003', 'documentation', 80, dims);

    await validateVisionScore(sd, supabase);

    expect(auditInserts.length).toBe(1);
    expect(auditInserts[0].floor_rule_triggered).toBe(true);
    expect(auditInserts[0].verdict).toBe('human_review_floor_dims');
  });

  it('audit log contains all required fields', async () => {
    const auditInserts = [];
    const supabase = makeAuditCapturingSupabase(auditInserts);
    const dims = { architecture: 90, reliability: 85, scalability: 80, security: 75 };
    const sd = makeSD('SD-AUDIT-004', 'infrastructure', 85, dims);

    await validateVisionScore(sd, supabase);

    const log = auditInserts[0];
    expect(log).toHaveProperty('sd_id');
    expect(log).toHaveProperty('sd_type');
    expect(log).toHaveProperty('total_dims');
    expect(log).toHaveProperty('addressable_count');
    expect(log).toHaveProperty('base_threshold');
    expect(log).toHaveProperty('adjusted_threshold');
    expect(log).toHaveProperty('score');
    expect(log).toHaveProperty('verdict');
  });

  it('audit log failure does not block gate result', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'vision_scoring_audit_log') {
          return { insert: vi.fn().mockRejectedValue(new Error('DB write failed')) };
        }
        const obj = { select: () => obj, eq: () => obj, order: () => obj, limit: () => Promise.resolve({ data: [] }) };
        return obj;
      }),
    };
    const sd = makeSD('SD-AUDIT-005', 'feature', 95, { dim_a: 90 });
    const result = await validateVisionScore(sd, supabase);

    // Gate should still pass despite audit log failure
    expect(result.passed).toBe(true);
  });
});

// ─── Tests: SD_TYPE_ADDRESSABLE_DIMENSIONS config ───────────────────────────

describe('SD_TYPE_ADDRESSABLE_DIMENSIONS', () => {
  it('feature type has null (all addressable)', () => {
    expect(SD_TYPE_ADDRESSABLE_DIMENSIONS.feature).toBeNull();
  });

  it('infrastructure type has specific patterns', () => {
    const patterns = SD_TYPE_ADDRESSABLE_DIMENSIONS.infrastructure;
    expect(patterns).toContain('architecture');
    expect(patterns).toContain('reliability');
    expect(patterns).toContain('security');
    expect(patterns).not.toContain('ui');
    expect(patterns).not.toContain('accessibility');
  });

  it('documentation type has documentation-relevant patterns', () => {
    const patterns = SD_TYPE_ADDRESSABLE_DIMENSIONS.documentation;
    expect(patterns).toContain('documentation');
    expect(patterns).toContain('knowledge');
    expect(patterns).not.toContain('architecture');
  });
});
