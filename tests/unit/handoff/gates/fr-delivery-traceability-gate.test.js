// Tests for SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001 — the EXEC-TO-PLAN FR delivery gate
// and its registration in BOTH the orchestrator-child and normal gate sets.

import { describe, it, expect } from 'vitest';
import { createFrDeliveryTraceabilityGate } from '../../../../scripts/modules/handoff/gates/fr-delivery-traceability-gate.js';

// supabase stub: no children, FRs from PRD, stories from user_stories
function stub({ children = [], frs = [], stories = [] } = {}) {
  return {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        maybeSingle() {
          if (table === 'product_requirements_v2') return Promise.resolve({ data: { functional_requirements: frs }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(res) {
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: children, error: null }).then(res);
          if (table === 'user_stories') return Promise.resolve({ data: stories, error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

const ctx = { sd: { id: 'sd-1', metadata: {} } };

describe('FR-3: createFrDeliveryTraceabilityGate', () => {
  it('has the expected gate shape', () => {
    const g = createFrDeliveryTraceabilityGate(stub());
    expect(g.name).toBe('FR_DELIVERY_TRACEABILITY');
    expect(typeof g.validator).toBe('function');
  });

  it('orchestrator PARENT delegates to children (pass)', async () => {
    const g = createFrDeliveryTraceabilityGate(stub({ children: [{ id: 'child-1' }] }));
    const r = await g.validator(ctx);
    expect(r.passed).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/delegated to children/i);
  });

  it('OFF (default): undelivered FR -> warn-only pass (no env set)', async () => {
    const prev = process.env.LEO_FR_TRACEABILITY_ENFORCE;
    delete process.env.LEO_FR_TRACEABILITY_ENFORCE;
    try {
      const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [] }));
      const r = await g.validator(ctx);
      expect(r.passed).toBe(true);
      expect(r.required).toBe(false);
      expect(r.warnings.join(' ')).toMatch(/FR-001/);
    } finally { if (prev === undefined) delete process.env.LEO_FR_TRACEABILITY_ENFORCE; else process.env.LEO_FR_TRACEABILITY_ENFORCE = prev; }
  });

  it('ON: undelivered FR -> hard fail', async () => {
    const prev = process.env.LEO_FR_TRACEABILITY_ENFORCE;
    process.env.LEO_FR_TRACEABILITY_ENFORCE = '1';
    try {
      const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [] }));
      const r = await g.validator(ctx);
      expect(r.passed).toBe(false);
      expect(r.required).toBe(true);
    } finally { if (prev === undefined) delete process.env.LEO_FR_TRACEABILITY_ENFORCE; else process.env.LEO_FR_TRACEABILITY_ENFORCE = prev; }
  });

  it('delivered FR -> pass', async () => {
    const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [{ id: 's1', title: 'do FR-001', status: 'completed' }] }));
    const r = await g.validator(ctx);
    expect(r.passed).toBe(true);
  });
});
