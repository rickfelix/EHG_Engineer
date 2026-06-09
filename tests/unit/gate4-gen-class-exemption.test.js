/**
 * SD-LEO-INFRA-FIX-GEN-CLASS-001 — GATE4_WORKFLOW_ROI must exempt GEN-class
 * auto-generated SDs, mirroring the existing GATE_VISION_SCORE auto_generated
 * exemption. Without it, a security/governance-type GEN SD (not in GATE4's
 * gate2-skip list) scores 0 on empty content and is doomed on a second
 * content-based gate after vision already exempted it.
 *
 * The exemption returns early (before the PRD fetch), so the SD lookup mock is
 * all that's needed.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('child_process', () => ({ exec: vi.fn((cmd, cb) => cb && cb(null, '', '')) }));
vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, promisify: () => vi.fn().mockResolvedValue({ stdout: '', stderr: '' }) };
});
vi.mock('../../scripts/modules/adaptive-threshold-calculator.js', () => ({
  calculateAdaptiveThreshold: vi.fn().mockResolvedValue({ threshold: 60 })
}));
vi.mock('../../scripts/modules/pattern-tracking.js', () => ({
  getPatternStats: vi.fn().mockResolvedValue({ total: 0, resolved: 0 })
}));

import { validateGate4LeadFinal } from '../../scripts/modules/workflow-roi-validation.js';

// Minimal supabase mock: only the strategic_directives_v2 lookup matters for the
// early exemption path. The fallthrough (non-GEN) path also hits product_requirements_v2.
function buildMock({ metadata = null, sdType = 'security', prd = null } = {}) {
  return {
    from: vi.fn((table) => {
      if (table === 'strategic_directives_v2') {
        return { select: () => ({ or: () => ({ single: () => Promise.resolve({ data: { id: 'uuid-gen', sd_key: 'SD-AUDIT-SEC-001', sd_type: sdType, metadata }, error: null }) }) }) };
      }
      if (table === 'product_requirements_v2') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: prd, error: prd ? null : { code: 'PGRST116', message: 'no rows' } }) }) }) };
      }
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: [], error: null }) }) }) };
    }),
  };
}

describe('SD-LEO-INFRA-FIX-GEN-CLASS-001: GATE4 exempts GEN-class auto-generated SDs', () => {
  it('exempts a security-type GEN SD with metadata.auto_generated=true (score 100, gen_class_exempt)', async () => {
    const supabase = buildMock({ metadata: { auto_generated: true }, sdType: 'security' });
    const v = await validateGate4LeadFinal('SD-AUDIT-SEC-001', supabase, {});
    expect(v.passed).toBe(true);
    expect(v.score).toBe(100);
    expect(v.details.gen_class_exempt).toBe(true);
    expect(v.warnings.some((w) => /GEN-class auto-generated/.test(w))).toBe(true);
  });

  it('exempts a governance-type GEN SD too (gate2-skip list does not cover governance)', async () => {
    const supabase = buildMock({ metadata: { auto_generated: true }, sdType: 'governance' });
    const v = await validateGate4LeadFinal('SD-AUDIT-GOV-001', supabase, {});
    expect(v.score).toBe(100);
    expect(v.details.gen_class_exempt).toBe(true);
  });

  it('does NOT take the GEN-class exemption for a normal (non-auto-generated) SD', async () => {
    // No metadata.auto_generated and no PRD analysis → falls through to the normal
    // path (which skips Gate 4 for "no DESIGN/DATABASE analysis"), so gen_class_exempt
    // must be ABSENT — proving the exemption is scoped to the GEN-class signal only.
    const supabase = buildMock({ metadata: { source: 'feedback' }, sdType: 'security', prd: { metadata: {}, directive_id: 'SD-NORMAL-001', title: 'x', created_at: '2026-06-08T00:00:00Z' } });
    const v = await validateGate4LeadFinal('SD-NORMAL-001', supabase, {});
    expect(v.details.gen_class_exempt).toBeUndefined();
  });
});
