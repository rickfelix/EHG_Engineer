/**
 * Tests for Vision Score Gate (LEAD-TO-PLAN)
 * SD-LEO-INFRA-EXPAND-GATE-VISION-001
 *
 * First unit-test coverage for this gate. Primarily exercises the
 * SD_TYPE_ADDRESSABLE_DIMENSIONS -> countAddressableDimensions pipeline to
 * guard against regressions when the keyword map is widened.
 *
 * Witnessed evidence: SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 and
 * SD-MAN-INFRA-NEXT-CONTENTION-DETECTOR-001 previously landed in the
 * addressable<MIN floor-rule path because the original 8 infrastructure
 * keywords missed CLI/workflow/protocol/governance language. This suite
 * asserts post-change behavior + backward compatibility.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  SD_TYPE_ADDRESSABLE_DIMENSIONS,
  MIN_ADDRESSABLE_DIMENSIONS,
  MIN_ADJUSTED_THRESHOLD_RATIO,
  NARROW_FEATURE_DIM_FLOOR,
  countAddressableDimensions,
  getAddressableDimNames,
  calculateDynamicThreshold,
  buildTierRemediationHint,
  validateVisionScore,
} from './vision-score.js';

// Convert dim names to the JSONB shape the real gate consumes
// (Object keyed by dimension name -> numeric score).
function mkDims(names) {
  return Object.fromEntries(names.map((n, i) => [n, 70 + i]));
}

describe('SD_TYPE_ADDRESSABLE_DIMENSIONS — infrastructure keyword set', () => {
  it('retains the original 8 keywords (backward-compat snapshot)', () => {
    const infra = SD_TYPE_ADDRESSABLE_DIMENSIONS.infrastructure;
    const required = [
      'architecture',
      'reliability',
      'scalability',
      'performance',
      'security',
      'maintainability',
      'automation',
      'observability',
    ];
    for (const k of required) {
      expect(infra).toContain(k);
    }
  });

  it('adds the 4 new keywords for CLI-first infra SDs (SD-LEO-INFRA-EXPAND-GATE-VISION-001)', () => {
    const infra = SD_TYPE_ADDRESSABLE_DIMENSIONS.infrastructure;
    for (const k of ['cli', 'workflow', 'protocol', 'governance']) {
      expect(infra).toContain(k);
    }
  });

  it('does not widen maintenance/orchestrator/protocol/refactor entries (symmetry-decision lock)', () => {
    expect(SD_TYPE_ADDRESSABLE_DIMENSIONS.maintenance).toEqual([
      'reliability', 'maintainability', 'performance', 'security', 'architecture',
    ]);
    expect(SD_TYPE_ADDRESSABLE_DIMENSIONS.refactor).toEqual([
      'architecture', 'maintainability', 'performance', 'scalability', 'reliability',
    ]);
    expect(SD_TYPE_ADDRESSABLE_DIMENSIONS.protocol).toEqual([
      'process', 'governance', 'compliance', 'documentation', 'automation', 'quality',
    ]);
    expect(SD_TYPE_ADDRESSABLE_DIMENSIONS.orchestrator).toBeNull();
  });
});

describe('countAddressableDimensions — witnessed-SD fixtures', () => {
  it('SD-LEO-INFRA-CROSS-FILE-OVERLAP-001 scope yields addressable >= MIN (post-change)', () => {
    // Scope mentions "protocol enforcement, gate pipeline, handoff" —
    // maps to governance/workflow/protocol/cli dimension names.
    const dims = mkDims([
      'protocol_enforcement',
      'workflow_handoff_integrity',
      'cli_first_design',
      'automation_by_default',
    ]);
    const { addressable, total } = countAddressableDimensions('infrastructure', dims);
    expect(total).toBe(4);
    expect(addressable).toBeGreaterThanOrEqual(MIN_ADDRESSABLE_DIMENSIONS);
  });

  it('SD-MAN-INFRA-NEXT-CONTENTION-DETECTOR-001 scope yields addressable >= MIN (post-change)', () => {
    // Scope mentions "CLAIMED, enriched_by_session, governance" — maps
    // to governance/cli/workflow dimension names.
    const dims = mkDims([
      'governance_gatekeeping',
      'cli_first_design',
      'workflow_handoff_integrity',
      'reliability_safety_nets',
    ]);
    const { addressable, total } = countAddressableDimensions('infrastructure', dims);
    expect(total).toBe(4);
    expect(addressable).toBeGreaterThanOrEqual(MIN_ADDRESSABLE_DIMENSIONS);
  });

  it('pre-existing 8 keywords continue to resolve against their canonical dimension names', () => {
    const dims = mkDims([
      'architecture_soundness',
      'reliability_safety_nets',
      'scalability_headroom',
      'performance_envelope',
      'security_posture',
      'maintainability_and_clarity',
      'automation_by_default',
      'observability_coverage',
    ]);
    const { addressable, total } = countAddressableDimensions('infrastructure', dims);
    expect(total).toBe(8);
    expect(addressable).toBe(8);
  });
});

describe('countAddressableDimensions — edge cases', () => {
  it('returns 0/0 when dimensionScores is null or undefined', () => {
    expect(countAddressableDimensions('infrastructure', null)).toEqual({ addressable: 0, total: 0 });
    expect(countAddressableDimensions('infrastructure', undefined)).toEqual({ addressable: 0, total: 0 });
  });

  it('returns 0/0 for empty dimension object', () => {
    expect(countAddressableDimensions('infrastructure', {})).toEqual({ addressable: 0, total: 0 });
  });

  it('all-addressable (null patterns) returns total=addressable for feature/orchestrator', () => {
    const dims = mkDims(['anything_goes_here', 'user_delight', 'payment_flow']);
    expect(countAddressableDimensions('feature', dims)).toEqual({ addressable: 3, total: 3 });
    expect(countAddressableDimensions('orchestrator', dims)).toEqual({ addressable: 3, total: 3 });
  });

  it('unknown sd_type falls back to all-addressable (existing behavior preserved)', () => {
    const dims = mkDims(['arbitrary_dim_a', 'arbitrary_dim_b']);
    const { addressable, total } = countAddressableDimensions('mystery_type', dims);
    // patterns === undefined branch returns { addressable: total, total } (line ~101).
    expect(addressable).toBe(total);
    expect(total).toBe(2);
  });
});

describe('countAddressableDimensions — isolation between sd_types', () => {
  it('widening infrastructure does not leak into refactor', () => {
    const dims = mkDims(['cli_first_design', 'workflow_handoff_integrity']);
    // refactor entry does NOT contain cli/workflow/protocol/governance.
    expect(countAddressableDimensions('refactor', dims).addressable).toBe(0);
    // infrastructure now matches both.
    expect(countAddressableDimensions('infrastructure', dims).addressable).toBe(2);
  });

  it('widening infrastructure does not leak into maintenance', () => {
    const dims = mkDims(['governance_gatekeeping', 'cli_first_design']);
    expect(countAddressableDimensions('maintenance', dims).addressable).toBe(0);
    expect(countAddressableDimensions('infrastructure', dims).addressable).toBe(2);
  });
});

describe('calculateDynamicThreshold — sanity (unchanged behavior)', () => {
  it('returns base when all addressable', () => {
    expect(calculateDynamicThreshold(80, 4, 4)).toBe(80);
    expect(calculateDynamicThreshold(80, 5, 4)).toBe(80);
  });

  it('scales down when addressable < total but floors at 60% of base (QF-20260505-102)', () => {
    // 2/4 = 50%, ratio-based = 40, floor = 80 * 0.6 = 48 → use 48
    expect(calculateDynamicThreshold(80, 2, 4)).toBe(48);
    // 3/10 = 30%, ratio-based = 27, floor = 90 * 0.6 = 54 → use 54
    expect(calculateDynamicThreshold(90, 3, 10)).toBe(54);
    // 5/6 = 83%, ratio-based = 75, floor = 90 * 0.6 = 54 → use 75 (floor doesn't kick in)
    expect(calculateDynamicThreshold(90, 5, 6)).toBe(75);
  });

  it('returns base when total is 0 (no dimension data)', () => {
    expect(calculateDynamicThreshold(80, 0, 0)).toBe(80);
  });
});

describe('SD-FDBK-INFRA-GATE-VISION-SCORE-001 — narrow/focused-feature carve-out', () => {
  it('NARROW_FEATURE_DIM_FLOOR is pinned at 50 (calibration)', () => {
    expect(NARROW_FEATURE_DIM_FLOOR).toBe(50);
  });

  it('getAddressableDimNames auto-detects a focused feature from scores (>= floor)', () => {
    const dims = { a: 90, b: 85, c: 80, d: 30, e: 20, f: 10 };
    expect(getAddressableDimNames('feature', dims).sort()).toEqual(['a', 'b', 'c']);
    expect(countAddressableDimensions('feature', dims)).toEqual({ addressable: 3, total: 6 });
  });

  it('broad feature (all dims >= floor) stays all-addressable (no narrowing → full bar)', () => {
    const dims = { a: 88, b: 77, c: 66, d: 55 };
    expect(countAddressableDimensions('feature', dims)).toEqual({ addressable: 4, total: 4 });
  });

  it('manual vision_addressable_dimensions override still wins over score-based auto-detect', () => {
    const dims = { security_posture: 90, performance_x: 90, cli_y: 90 };
    const meta = { vision_addressable_dimensions: ['security'] };
    expect(getAddressableDimNames('feature', dims, meta)).toEqual(['security_posture']);
  });

  it('non-null pattern types stay pattern-based (not score-based) — no leakage from the carve-out', () => {
    const dims = { user_delight: 90, architecture_clarity: 90 };
    // refactor pattern set has 'architecture' but not 'user'/'delight'
    expect(getAddressableDimNames('refactor', dims).sort()).toEqual(['architecture_clarity']);
  });

  it('gate: focused-good feature passes at the narrowed threshold without manual tuning', async () => {
    const sd = {
      sd_key: 'TEST-FOCUSED-GOOD', sd_type: 'feature',
      vision_score: 60, vision_score_action: 'gap_closure_sd',
      dimension_scores: { a: 90, b: 85, c: 80, d: 20, e: 15, f: 10 }, metadata: {},
    };
    // addressable 3/6 → threshold max(90*3/6=45, 54)=54; addressable avg 85 >= 60; score 60 >= 54 → pass
    const r = await validateVisionScore(sd, null);
    expect(r.passed).toBe(true);
  });

  it('gate: broad-but-mediocre feature still faces the full 90 bar (cannot game the carve-out)', async () => {
    const sd = {
      sd_key: 'TEST-BROAD-MEDIOCRE', sd_type: 'feature',
      vision_score: 55, vision_score_action: 'gap_closure_sd',
      dimension_scores: { a: 55, b: 56, c: 54, d: 55, e: 53, f: 57 }, metadata: {},
    };
    // all dims >= 50 → addressable == total → no narrowing → bar 90; 55 < 90 → block
    const r = await validateVisionScore(sd, null);
    expect(r.passed).toBe(false);
  });

  it('gate: focused-but-weak feature is blocked by the addressable-average floor', async () => {
    const sd = {
      sd_key: 'TEST-FOCUSED-WEAK', sd_type: 'feature',
      vision_score: 58, vision_score_action: 'gap_closure_sd',
      dimension_scores: { a: 55, b: 52, c: 51, d: 10, e: 10, f: 10 }, metadata: {},
    };
    // addressable [55,52,51] avg 52.7 < 60 → avg-floor hard-blocks before the threshold check
    const r = await validateVisionScore(sd, null);
    expect(r.passed).toBe(false);
  });
});

// SD-LEO-INFRA-VISION-SCORER-L2-FLAGS-001
describe('buildTierRemediationHint', () => {
  let originalVisionEnv;
  let originalArchEnv;

  beforeEach(() => {
    originalVisionEnv = process.env.LEO_VISION_KEY_OVERRIDE;
    originalArchEnv = process.env.LEO_ARCH_KEY_OVERRIDE;
    delete process.env.LEO_VISION_KEY_OVERRIDE;
    delete process.env.LEO_ARCH_KEY_OVERRIDE;
  });

  afterEach(() => {
    if (originalVisionEnv === undefined) delete process.env.LEO_VISION_KEY_OVERRIDE;
    else process.env.LEO_VISION_KEY_OVERRIDE = originalVisionEnv;
    if (originalArchEnv === undefined) delete process.env.LEO_ARCH_KEY_OVERRIDE;
    else process.env.LEO_ARCH_KEY_OVERRIDE = originalArchEnv;
  });

  it('returns blank hint when no signals present', () => {
    const result = buildTierRemediationHint({ sd_key: 'SD-FOO-BAR-001', metadata: null });
    expect(result).toEqual({ tier: null, source: null, flagSuffix: '', note: null });
  });

  it('uses env override when set', () => {
    process.env.LEO_VISION_KEY_OVERRIDE = 'VISION-EHG-L2-001';
    process.env.LEO_ARCH_KEY_OVERRIDE = 'ARCH-EHG-L2-001';
    const result = buildTierRemediationHint({ sd_key: 'SD-X-001', metadata: null });
    expect(result.tier).toBe('L2');
    expect(result.source).toBe('env_override');
    expect(result.flagSuffix).toBe(' --vision-key VISION-EHG-L2-001 --arch-key ARCH-EHG-L2-001');
    expect(result.note).toContain('LEO_VISION_KEY_OVERRIDE');
  });

  it('uses sd.metadata.vision_key when present (no flag suffix needed)', () => {
    const sd = { sd_key: 'SD-X-001', metadata: { vision_key: 'VISION-EHG-L2-001' } };
    const result = buildTierRemediationHint(sd);
    expect(result.tier).toBe('L2');
    expect(result.source).toBe('sd.metadata.vision_key');
    expect(result.flagSuffix).toBe('');
    expect(result.note).toContain("sd.metadata.vision_key='VISION-EHG-L2-001'");
  });

  it('falls back to sd_key suffix autodetect (L2)', () => {
    const sd = { sd_key: 'SD-VISION-S17-SIMPLIFY-L2-001', metadata: null };
    const result = buildTierRemediationHint(sd);
    expect(result.tier).toBe('L2');
    expect(result.source).toBe('sd_key_suffix');
    expect(result.flagSuffix).toBe(' --vision-key VISION-EHG-L2-001 --arch-key ARCH-EHG-L2-001');
    expect(result.note).toContain('tier L2');
  });

  it('falls back to sd_key suffix autodetect (L3)', () => {
    const sd = { sd_key: 'SD-A-L3-005', metadata: null };
    const result = buildTierRemediationHint(sd);
    expect(result.tier).toBe('L3');
    expect(result.flagSuffix).toBe(' --vision-key VISION-EHG-L3-001 --arch-key ARCH-EHG-L3-001');
  });

  it('env override takes precedence over metadata', () => {
    process.env.LEO_VISION_KEY_OVERRIDE = 'VISION-EHG-L3-001';
    const sd = { sd_key: 'SD-X-001', metadata: { vision_key: 'VISION-EHG-L1-001' } };
    const result = buildTierRemediationHint(sd);
    expect(result.tier).toBe('L3');
    expect(result.source).toBe('env_override');
  });

  it('metadata takes precedence over sd_key suffix', () => {
    const sd = {
      sd_key: 'SD-FOO-L1-001',
      metadata: { vision_key: 'VISION-EHG-L2-001' }
    };
    const result = buildTierRemediationHint(sd);
    expect(result.tier).toBe('L2');
    expect(result.source).toBe('sd.metadata.vision_key');
  });

  it('returns blank hint when sd_key is missing and no overrides', () => {
    const result = buildTierRemediationHint({ metadata: null });
    expect(result).toEqual({ tier: null, source: null, flagSuffix: '', note: null });
  });

  it('uses .id when sd_key is missing for suffix detection', () => {
    const sd = { id: 'SD-FOO-L2-001', metadata: null };
    const result = buildTierRemediationHint(sd);
    expect(result.tier).toBe('L2');
    expect(result.source).toBe('sd_key_suffix');
  });
});

describe('countAddressableDimensions — SD-level override (QF-20260505-102)', () => {
  const dims = mkDims([
    'automation_by_default',
    'chairman_governance_model',
    'analysisstep_active_intelligence',
    'decision_filter_engine_escalation',
    'cross_stage_data_contracts',
    'cli_authoritative_workflow',
    'unlimited_compute_posture',
    'chairman_dashboard_scope',
    'governance_guardrail_enforcement',
  ]);

  it('SD-level vision_addressable_dimensions takes precedence over feature=null', () => {
    const metadata = {
      vision_addressable_dimensions: ['chairman', 'governance', 'dashboard'],
    };
    const { addressable, total } = countAddressableDimensions('feature', dims, metadata);
    expect(total).toBe(9);
    // Matches: chairman_governance_model, chairman_dashboard_scope,
    // governance_guardrail_enforcement, decision_filter_engine_escalation? no (no chairman/governance/dashboard substring there) — wait yes 'governance' is in 'governance_guardrail_enforcement'
    expect(addressable).toBe(3); // chairman_governance, chairman_dashboard, governance_guardrail
  });

  it('falls through to SD_TYPE_ADDRESSABLE_DIMENSIONS when override is empty array', () => {
    const metadata = { vision_addressable_dimensions: [] };
    const { addressable, total } = countAddressableDimensions('feature', dims, metadata);
    // feature=null in type map → all addressable
    expect(addressable).toBe(total);
  });

  it('falls through to SD_TYPE_ADDRESSABLE_DIMENSIONS when override is missing', () => {
    const { addressable, total } = countAddressableDimensions('feature', dims, {});
    expect(addressable).toBe(total);
  });

  it('falls through when sdMetadata is null/undefined (backward compat)', () => {
    const r1 = countAddressableDimensions('feature', dims, null);
    const r2 = countAddressableDimensions('feature', dims, undefined);
    const r3 = countAddressableDimensions('feature', dims); // no third arg
    expect(r1.addressable).toBe(r1.total);
    expect(r2.addressable).toBe(r2.total);
    expect(r3.addressable).toBe(r3.total);
  });

  it('SD override applies even when sd_type has its own pattern list', () => {
    // infrastructure has a curated list, but SD override should win
    const metadata = { vision_addressable_dimensions: ['chairman'] };
    const { addressable } = countAddressableDimensions('infrastructure', dims, metadata);
    expect(addressable).toBe(2); // chairman_governance_model, chairman_dashboard_scope
  });
});

describe('calculateDynamicThreshold — anti-abuse floor (QF-20260505-102)', () => {
  it('exposes MIN_ADJUSTED_THRESHOLD_RATIO at 0.6', () => {
    expect(MIN_ADJUSTED_THRESHOLD_RATIO).toBe(0.6);
  });

  it('floors threshold reduction at 60% of base for narrow addressable counts', () => {
    // 2 of 18 addressable: ratio-based = 90 * 2/18 = 10. Floor = 90 * 0.6 = 54.
    const result = calculateDynamicThreshold(90, 2, 18);
    expect(result).toBe(54);
  });

  it('does not floor when ratio-based already exceeds the floor', () => {
    // 12 of 18 addressable: ratio-based = 90 * 12/18 = 60. Floor = 54. Use 60.
    const result = calculateDynamicThreshold(90, 12, 18);
    expect(result).toBe(60);
  });

  it('returns base when all dims addressable (no adjustment)', () => {
    expect(calculateDynamicThreshold(90, 18, 18)).toBe(90);
    expect(calculateDynamicThreshold(80, 8, 8)).toBe(80);
  });

  it('returns base when total is 0 (no dim data)', () => {
    expect(calculateDynamicThreshold(90, 0, 0)).toBe(90);
  });

  it('rounds to nearest integer', () => {
    // base=85, 5/9 addressable, ratio = 85 * 5/9 = 47.22; floor = 85*0.6 = 51. Use 51.
    expect(calculateDynamicThreshold(85, 5, 9)).toBe(51);
    // base=85, 7/9 addressable, ratio = 85 * 7/9 = 66.11; floor = 51. Use 66.
    expect(calculateDynamicThreshold(85, 7, 9)).toBe(66);
  });
});
