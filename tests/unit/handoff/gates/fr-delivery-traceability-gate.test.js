// Tests for SD-LEO-INFRA-HARDEN-LEO-COMPLETION-001 — the EXEC-TO-PLAN FR delivery gate
// and its registration in BOTH the orchestrator-child and normal gate sets.

import { describe, it, expect } from 'vitest';
import { createFrDeliveryTraceabilityGate } from '../../../../scripts/modules/handoff/gates/fr-delivery-traceability-gate.js';

// supabase stub: no children, FRs from PRD (keyed on directive_id == PRD_KEY to catch the
// UUID-vs-sd_key lookup bug), stories from user_stories.
const PRD_KEY = 'SD-FR-001'; // the sd_key; PRD.directive_id stores this, NOT the UUID
function stub({ children = [], frs = [], stories = [], childrenQueryError = null, testingRows = [] } = {}) {
  return {
    from(table) {
      const state = { filters: {} };
      const chain = {
        select() { return chain; },
        eq(k, v) { state.filters[k] = v; return chain; },
        maybeSingle() {
          if (table === 'product_requirements_v2') {
            // Only resolve FRs when the lookup keyed on the sd_key (directive_id), proving the
            // gate passed directiveId=sd_key rather than the UUID.
            const data = state.filters.directive_id === PRD_KEY ? { functional_requirements: frs } : null;
            return Promise.resolve({ data, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        // QF-20260816-550: isParentOrchestrator() calls .eq(...).limit(1) on
        // strategic_directives_v2 — the gate no longer hand-rolls this query.
        limit(_n) {
          if (table === 'strategic_directives_v2') {
            return Promise.resolve(childrenQueryError ? { data: null, error: childrenQueryError } : { data: children, error: null });
          }
          return Promise.resolve({ data: [], error: null });
        },
        then(res) {
          if (table === 'strategic_directives_v2') return Promise.resolve({ data: children, error: null }).then(res);
          if (table === 'user_stories') return Promise.resolve({ data: stories, error: null }).then(res);
          // SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001: previously this fell through to the
          // catch-all [] below for sub_agent_execution_results too, so the new testing_evidence
          // signal was never exercised through the REAL gate validator -- only through
          // classifyFrDelivery() called directly in the classifier's own unit tests. TS-10's
          // byte-identical projectGateResult() check proved the shape is tolerated; it never
          // proved the wire from a DB row to a gate verdict is actually connected.
          if (table === 'sub_agent_execution_results') return Promise.resolve({ data: testingRows, error: null }).then(res);
          return Promise.resolve({ data: [], error: null }).then(res);
        },
      };
      return chain;
    },
  };
}

// QF-20260816-550: isParentOrchestrator() caches its verdict in a WeakMap keyed on SD
// object IDENTITY. The gate's old hand-rolled query re-ran on every call (no caching), so
// a single shared `ctx` constant across every test in this file was harmless. Delegating to
// the canonical helper means that stale pattern silently poisons every later test with the
// FIRST test's cached verdict for that exact object — makeCtx() gives each test its own SD
// object so each gets its own cache entry.
function makeCtx(metadataOverrides = {}) {
  return { sd: { id: 'sd-uuid-1', sd_key: PRD_KEY, metadata: metadataOverrides } };
}

describe('FR-3: createFrDeliveryTraceabilityGate', () => {
  it('has the expected gate shape', () => {
    const g = createFrDeliveryTraceabilityGate(stub());
    expect(g.name).toBe('FR_DELIVERY_TRACEABILITY');
    expect(typeof g.validator).toBe('function');
  });

  it('orchestrator PARENT delegates to children (pass)', async () => {
    const g = createFrDeliveryTraceabilityGate(stub({ children: [{ id: 'child-1' }] }));
    const r = await g.validator(makeCtx());
    expect(r.passed).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/delegated to children/i);
  });

  it('OFF (default): undelivered FR -> warn-only pass (no env set)', async () => {
    const prev = process.env.LEO_FR_TRACEABILITY_ENFORCE;
    delete process.env.LEO_FR_TRACEABILITY_ENFORCE;
    try {
      const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [] }));
      const r = await g.validator(makeCtx());
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
      const r = await g.validator(makeCtx());
      expect(r.passed).toBe(false);
      expect(r.required).toBe(true);
    } finally { if (prev === undefined) delete process.env.LEO_FR_TRACEABILITY_ENFORCE; else process.env.LEO_FR_TRACEABILITY_ENFORCE = prev; }
  });

  it('delivered FR -> pass', async () => {
    const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [{ id: 's1', title: 'do FR-001', status: 'completed' }] }));
    const r = await g.validator(makeCtx());
    expect(r.passed).toBe(true);
  });

  describe('QF-20260816-550: canonical isParentOrchestrator dispatch (was a hand-rolled, error-blind query)', () => {
    it('leaf (metadata unset, 0 children) -> FR delivery IS classified, not skipped', async () => {
      const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [] }));
      const r = await g.validator(makeCtx());
      expect(r.warnings.join(' ')).not.toMatch(/delegated to children/i);
    });

    it('metadata-only parent (is_parent=true, 0 DB children, query succeeds) -> treated as LEAF per the mismatch fix, not delegated', async () => {
      const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [], children: [] }));
      const r = await g.validator(makeCtx({ is_parent: true }));
      expect(r.warnings.join(' ')).not.toMatch(/delegated to children/i);
    });

    it('children query error -> falls back to metadata flag (parent branch), NOT silently treated as leaf', async () => {
      const g = createFrDeliveryTraceabilityGate(stub({ frs: [{ id: 'FR-001' }], stories: [], childrenQueryError: { message: 'connection reset' } }));
      const r = await g.validator(makeCtx({ is_parent: true }));
      expect(r.passed).toBe(true);
      expect(r.warnings.join(' ')).toMatch(/delegated to children/i);
    });
  });

  // SD-LEO-INFRA-FR-DELIVERY-SECOND-SIGNAL-001 F8: end-to-end proof that testing_evidence
  // reaches an actual gate verdict, not just classifyFrDelivery() in isolation.
  describe('testing_evidence second signal reaches the real gate validator', () => {
    it('a zero-story SD with a valid EXEC-phase fr_coverage entry PASSES via testing_evidence -- not just warn-only-on-undelivered', async () => {
      const g = createFrDeliveryTraceabilityGate(stub({
        frs: [{ id: 'FR-001' }],
        stories: [],
        testingRows: [{ id: 'row-1', phase: 'EXEC', metadata: { fr_coverage: [{ fr_id: 'FR-001', status: 'delivered', test_ref: 'tests/x.test.js:1' }] } } ],
      }));
      const r = await g.validator(makeCtx());
      expect(r.passed).toBe(true);
      expect(r.score).toBe(100);
      expect(r.details.frs[0].delivery_basis).toBe('testing_evidence');
    });

    it('ON: a zero-story SD with NO fr_coverage still hard-fails (the second signal does not weaken enforcement when absent)', async () => {
      const prev = process.env.LEO_FR_TRACEABILITY_ENFORCE;
      process.env.LEO_FR_TRACEABILITY_ENFORCE = '1';
      try {
        const g = createFrDeliveryTraceabilityGate(stub({
          frs: [{ id: 'FR-001' }],
          stories: [],
          testingRows: [{ id: 'row-1', phase: 'EXEC', metadata: {} }],
        }));
        const r = await g.validator(makeCtx());
        expect(r.passed).toBe(false);
        expect(r.details.testing_evidence_rows_seen).toBe(1);
      } finally { if (prev === undefined) delete process.env.LEO_FR_TRACEABILITY_ENFORCE; else process.env.LEO_FR_TRACEABILITY_ENFORCE = prev; }
    });

    it('a LEAD-phase fr_coverage entry does not promote through the real gate (phase filter survives the full wire)', async () => {
      const g = createFrDeliveryTraceabilityGate(stub({
        frs: [{ id: 'FR-001' }],
        stories: [],
        testingRows: [{ id: 'row-1', phase: 'LEAD', metadata: { fr_coverage: [{ fr_id: 'FR-001', status: 'delivered', test_ref: 'x' }] } }],
      }));
      const r = await g.validator(makeCtx());
      expect(r.details.frs[0].delivery_basis).not.toBe('testing_evidence');
      expect(r.details.testing_evidence_rows_seen).toBe(0);
    });
  });
});
