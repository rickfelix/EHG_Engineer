/**
 * SD-LEO-INFRA-PLAN-LINKAGE-BELT-001 (FR-1): lib/sd-creation/plan-linkage-classifier.js
 *
 * TS-1: 6 non-roadmap adapters with no parent/wave-disposition -> unlinked with a valid
 * classified reason. TS-2: child inherits a wave-linked parent's linkage verbatim.
 */
import { describe, it, expect } from 'vitest';
import { classifyPlanLinkage, classifyUnlinkedReason, UNLINKED_REASONS } from '../../../lib/sd-creation/plan-linkage-classifier.js';

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001: classifyUnlinkedReason', () => {
  it('classifies harness-prefixed keys as harness-upkeep', () => {
    expect(classifyUnlinkedReason('SD-LEO-INFRA-FOO-001')).toBe('harness-upkeep');
    expect(classifyUnlinkedReason('SD-MAN-INFRA-FOO-001')).toBe('harness-upkeep');
    expect(classifyUnlinkedReason('SD-LEARN-FIX-FOO-001')).toBe('harness-upkeep');
    expect(classifyUnlinkedReason('QF-20260718-001')).toBe('harness-upkeep');
  });

  it('classifies product-prefixed keys, or any key with a ventureId, as venture-ops', () => {
    expect(classifyUnlinkedReason('SD-EHG-PRODUCT-FOO-001')).toBe('venture-ops');
    expect(classifyUnlinkedReason('SD-SOME-FEATURE-001', 'venture-uuid-123')).toBe('venture-ops');
  });

  it('falls through to emergent-fix for everything else', () => {
    expect(classifyUnlinkedReason('SD-UAT-FIX-NAV-001')).toBe('emergent-fix');
  });

  it('every possible output is a member of the frozen 3-value enum', () => {
    const cases = ['SD-LEO-INFRA-X', 'SD-EHG-PRODUCT-X', 'SD-OTHER-X'];
    for (const key of cases) {
      expect(UNLINKED_REASONS).toContain(classifyUnlinkedReason(key));
    }
  });
});

describe('SD-LEO-INFRA-PLAN-LINKAGE-BELT-001: classifyPlanLinkage', () => {
  it('TS-1: with no parent and no wave disposition, returns linked=false with a valid enum reason (never null, never free text)', () => {
    const result = classifyPlanLinkage({ sdKey: 'SD-LEO-INFRA-EXAMPLE-001' });
    expect(result.linked).toBe(false);
    expect(result.wave_id).toBeNull();
    expect(UNLINKED_REASONS).toContain(result.unlinked_reason);
    expect(result.unlinked_reason).toBe('harness-upkeep');
    expect(result.classified_by).toBe('creation');
    expect(typeof result.classified_at).toBe('string');
  });

  it('TS-2: a child under a wave-linked parent inherits linked=true and identical wave_id/wave_title/rung', () => {
    const parentSd = {
      sd_key: 'SD-EHG-PRODUCT-PARENT-001',
      metadata: { plan_linkage: { linked: true, wave_id: 'wave-uuid-1', wave_title: 'Wave 3: Growth', rung: 'V2' } },
    };
    const result = classifyPlanLinkage({ sdKey: 'SD-EHG-PRODUCT-PARENT-001A', parentSd });
    expect(result.linked).toBe(true);
    expect(result.wave_id).toBe('wave-uuid-1');
    expect(result.wave_title).toBe('Wave 3: Growth');
    expect(result.rung).toBe('V2');
    expect(result.unlinked_reason).toBeNull();
  });

  it('a child under an UNLINKED parent does NOT inherit linked=true — falls through to its own classification', () => {
    const parentSd = {
      sd_key: 'SD-LEO-INFRA-PARENT-001',
      metadata: { plan_linkage: { linked: false, unlinked_reason: 'harness-upkeep' } },
    };
    const result = classifyPlanLinkage({ sdKey: 'SD-LEO-INFRA-PARENT-001A', parentSd });
    expect(result.linked).toBe(false);
    expect(result.unlinked_reason).toBe('harness-upkeep');
  });

  it('an explicit wave-disposition proposal with a waveId produces linked=true (plan.js door)', () => {
    const result = classifyPlanLinkage({ sdKey: 'SD-SOME-PLAN-001', waveDisposition: { waveId: 'wave-uuid-9' } });
    expect(result.linked).toBe(true);
    expect(result.wave_id).toBe('wave-uuid-9');
  });

  it('an explicit wave-disposition proposal with noWave produces a classified unlinked result PLUS the free-text reason as a separate field', () => {
    const result = classifyPlanLinkage({
      sdKey: 'SD-LEO-INFRA-PLAN-001',
      waveDisposition: { noWave: 'purely tactical harness fix, not roadmap work' },
    });
    expect(result.linked).toBe(false);
    expect(UNLINKED_REASONS).toContain(result.unlinked_reason);
    expect(result.unlinked_reason).toBe('harness-upkeep');
    expect(result.wave_disposition_reason).toBe('purely tactical harness fix, not roadmap work');
  });

  it('roadmap-item.js is out of scope — this module is never imported by it (structural check)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../../../lib/sd-creation/source-adapters/roadmap-item.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/plan-linkage-classifier/);
  });
});
