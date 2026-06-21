/**
 * SD-FDBK-INFRA-GATE-FALSE-NEGATIVE-001
 * classifyNonUIDesignContext: honor sd_type OR category independently so a UI-bearing
 * sd_type (e.g. 'feature') no longer masks a backend category. This is the defense-in-depth
 * fix for the empty-repo DESIGN false-negative on NO-UI backend SDs.
 */
import { describe, it, expect } from 'vitest';
import { classifyNonUIDesignContext, NON_UI_DESIGN_TYPES, NON_UI_DESIGN_CATEGORIES } from '../../../lib/sub-agents/design/index.js';

describe('classifyNonUIDesignContext', () => {
  it('skips on a non-UI sd_type (source=sd_type)', () => {
    const r = classifyNonUIDesignContext({ sd_type: 'infrastructure', category: 'Infrastructure' });
    expect(r).toEqual({ isNonUI: true, effectiveType: 'infrastructure', source: 'sd_type' });
  });

  it('THE FIX: honors category=backend even when sd_type=feature (no longer masked)', () => {
    const r = classifyNonUIDesignContext({ sd_type: 'feature', category: 'backend' });
    expect(r).toEqual({ isNonUI: true, effectiveType: 'backend', source: 'category' });
  });

  it('honors a non-UI category when sd_type is empty (category fallback preserved)', () => {
    const r = classifyNonUIDesignContext({ sd_type: '', category: 'api' });
    expect(r).toEqual({ isNonUI: true, effectiveType: 'api', source: 'category' });
  });

  it('PRESERVES DESIGN for a real UI feature SD (feature type + UI-ish category)', () => {
    const r = classifyNonUIDesignContext({ sd_type: 'feature', category: 'ux_improvement' });
    expect(r.isNonUI).toBe(false);
    expect(r.source).toBeNull();
  });

  it('does NOT skip a bare feature SD with no category', () => {
    const r = classifyNonUIDesignContext({ sd_type: 'feature', category: '' });
    expect(r.isNonUI).toBe(false);
  });

  it('is case-insensitive on both signals', () => {
    expect(classifyNonUIDesignContext({ sd_type: 'FEATURE', category: 'BACKEND' }))
      .toEqual({ isNonUI: true, effectiveType: 'backend', source: 'category' });
    expect(classifyNonUIDesignContext({ sd_type: 'Infrastructure', category: '' }).isNonUI).toBe(true);
  });

  it('handles empty / undefined input safely', () => {
    expect(classifyNonUIDesignContext()).toEqual({ isNonUI: false, effectiveType: null, source: null });
    expect(classifyNonUIDesignContext({}).isNonUI).toBe(false);
  });

  it('sd_type wins the source label when BOTH signals are non-UI', () => {
    // database type + infrastructure category -> sd_type takes precedence for labelling
    const r = classifyNonUIDesignContext({ sd_type: 'database', category: 'infrastructure' });
    expect(r).toEqual({ isNonUI: true, effectiveType: 'database', source: 'sd_type' });
  });

  it('exports the canonical non-UI signal list (includes backend)', () => {
    expect(NON_UI_DESIGN_TYPES).toContain('backend');
    expect(NON_UI_DESIGN_TYPES).toContain('infrastructure');
  });

  // --- Adversarial HIGH regression guard (SD-FDBK-INFRA-GATE-FALSE-NEGATIVE-001) ---
  // 'orchestrator'/'process' are CONTAINER categories that orchestrator children INHERIT,
  // so a pure-UI child SD carries category='orchestrator'. The category tier MUST NOT honor
  // them, or DESIGN would be bypassed on real UI work (~80 live SDs).
  it('does NOT skip a UI feature SD whose category is the inherited container "orchestrator"', () => {
    const r = classifyNonUIDesignContext({ sd_type: 'feature', category: 'orchestrator' });
    expect(r.isNonUI).toBe(false);
    expect(r.source).toBeNull();
  });

  it('does NOT skip a UI feature SD whose category is "process"', () => {
    expect(classifyNonUIDesignContext({ sd_type: 'enhancement', category: 'process' }).isNonUI).toBe(false);
  });

  it('STILL skips when sd_type itself is orchestrator/process (genuine no-UI coordinator)', () => {
    // The type tier remains broad — an sd_type=orchestrator SD is a coordinator with no UI.
    expect(classifyNonUIDesignContext({ sd_type: 'orchestrator', category: 'feature' }))
      .toEqual({ isNonUI: true, effectiveType: 'orchestrator', source: 'sd_type' });
    expect(classifyNonUIDesignContext({ sd_type: 'process', category: '' }).isNonUI).toBe(true);
  });

  it('category tier is a strict subset of the type tier (excludes the container categories)', () => {
    for (const c of NON_UI_DESIGN_CATEGORIES) expect(NON_UI_DESIGN_TYPES).toContain(c);
    expect(NON_UI_DESIGN_CATEGORIES).not.toContain('orchestrator');
    expect(NON_UI_DESIGN_CATEGORIES).not.toContain('process');
    expect(NON_UI_DESIGN_CATEGORIES).toContain('backend');
  });
});
