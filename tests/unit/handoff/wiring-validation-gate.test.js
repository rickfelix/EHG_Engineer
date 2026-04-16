/**
 * Unit tests for wiring-validation gate (EXEC-TO-PLAN).
 * SD: SD-LEO-WIRING-VERIFICATION-FRAMEWORK-ORCH-001-D
 *
 * Validates the three behaviours the gate must guarantee:
 *   1. Advisory pass when SD has not opted in
 *   2. Block with remediation when wiring_validated is null or false
 *   3. Pass when wiring_validated is true
 */

import { describe, it, expect } from 'vitest';
import { createWiringValidationGate } from '../../../scripts/modules/handoff/executors/exec-to-plan/gates/wiring-validation.js';

function mockSupabase({ sdRow, checksRows, parentMetadata }) {
  return {
    from(table) {
      if (table === 'strategic_directives_v2') {
        return {
          select: () => ({
            eq: (col, val) => {
              if (col === 'sd_key') {
                return { single: async () => ({ data: sdRow, error: null }) };
              }
              if (col === 'id') {
                return { maybeSingle: async () => ({ data: parentMetadata ? { metadata: parentMetadata } : null, error: null }) };
              }
              return { single: async () => ({ data: null, error: null }) };
            },
          }),
        };
      }
      if (table === 'leo_wiring_validations') {
        return {
          select: () => ({
            eq: () => ({ order: async () => ({ data: checksRows || [], error: null }) }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

const baseCtx = (overrides = {}) => ({
  sd: {
    sd_key: 'SD-TEST-001',
    id: 'uuid-xxx',
    metadata: {},
    parent_sd_id: null,
    ...overrides,
  },
});

describe('createWiringValidationGate — opt-in', () => {
  it('passes advisory when SD has not opted in and has no parent', async () => {
    const gate = createWiringValidationGate(mockSupabase({}));
    const result = await gate.validator(baseCtx());
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.warnings.join(' ')).toMatch(/advisory/i);
  });

  it('passes advisory when SD has no wiring_required and parent has no wiring_enforcement', async () => {
    const gate = createWiringValidationGate(
      mockSupabase({ parentMetadata: {} })
    );
    const result = await gate.validator(baseCtx({ parent_sd_id: 'parent-uuid' }));
    expect(result.passed).toBe(true);
    expect(result.warnings.join(' ')).toMatch(/advisory/i);
  });

  it('activates when SD metadata.wiring_required=true', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: true },
      checksRows: [],
    }));
    const result = await gate.validator(baseCtx({ metadata: { wiring_required: true } }));
    expect(result.passed).toBe(true);
    expect(result.warnings.join(' ')).not.toMatch(/advisory/i);
  });

  it('activates when parent has metadata.wiring_enforcement=true', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: true },
      checksRows: [],
      parentMetadata: { wiring_enforcement: true },
    }));
    const result = await gate.validator(baseCtx({ parent_sd_id: 'parent-uuid' }));
    expect(result.passed).toBe(true);
  });
});

describe('createWiringValidationGate — blocking', () => {
  it('blocks when opted in and wiring_validated=null', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: null },
      checksRows: [],
    }));
    const result = await gate.validator(baseCtx({ metadata: { wiring_required: true } }));
    expect(result.passed).toBe(false);
    expect(result.issues[0]).toMatch(/missing|pending/i);
    expect(result.remediation).toMatch(/wiring-validation-runner/);
    expect(result.remediation).toMatch(/VISION-LEO-WIRING-VERIFICATION/);
  });

  it('blocks when opted in and wiring_validated=false with failed checks', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: false },
      checksRows: [
        { check_type: 'orphan_detection', status: 'failed', signals_detected: 2, waived_by: null },
        { check_type: 'spec_code_drift', status: 'passed', signals_detected: 0, waived_by: null },
      ],
    }));
    const result = await gate.validator(baseCtx({ metadata: { wiring_required: true } }));
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => /orphan_detection/.test(i))).toBe(true);
    expect(result.remediation).toMatch(/bypass-wiring/);
    expect(result.remediation).toMatch(/waive_wiring_check/);
  });

  it('includes the inspection SQL and runner command in remediation text', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: false },
      checksRows: [{ check_type: 'orphan_detection', status: 'failed', signals_detected: 1, waived_by: null }],
    }));
    const result = await gate.validator(baseCtx({
      sd_key: 'SD-REAL-001',
      metadata: { wiring_required: true },
    }));
    expect(result.remediation).toContain('SD-REAL-001');
    expect(result.remediation).toContain('wiring-validation-runner.js');
    expect(result.remediation).toContain('leo_wiring_validations');
  });
});

describe('createWiringValidationGate — passing', () => {
  it('passes with warnings when wiring_validated=true and some checks warn', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: true },
      checksRows: [
        { check_type: 'orphan_detection', status: 'passed', signals_detected: 0 },
        { check_type: 'spec_code_drift', status: 'warning', signals_detected: 1 },
      ],
    }));
    const result = await gate.validator(baseCtx({ metadata: { wiring_required: true } }));
    expect(result.passed).toBe(true);
    expect(result.warnings.some(w => /spec_code_drift/.test(w))).toBe(true);
  });

  it('passes cleanly when all checks passed', async () => {
    const gate = createWiringValidationGate(mockSupabase({
      sdRow: { wiring_validated: true },
      checksRows: [
        { check_type: 'orphan_detection', status: 'passed', signals_detected: 0 },
        { check_type: 'spec_code_drift', status: 'passed', signals_detected: 0 },
      ],
    }));
    const result = await gate.validator(baseCtx({ metadata: { wiring_required: true } }));
    expect(result.passed).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
