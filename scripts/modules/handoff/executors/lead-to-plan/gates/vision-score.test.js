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
  countAddressableDimensions,
  calculateDynamicThreshold,
  buildTierRemediationHint,
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

  it('scales down when addressable < total', () => {
    expect(calculateDynamicThreshold(80, 2, 4)).toBe(40);
    expect(calculateDynamicThreshold(90, 3, 10)).toBe(27);
  });

  it('returns base when total is 0 (no dimension data)', () => {
    expect(calculateDynamicThreshold(80, 0, 0)).toBe(80);
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
