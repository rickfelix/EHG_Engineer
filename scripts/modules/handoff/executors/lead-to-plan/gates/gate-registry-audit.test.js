/**
 * Tests for the Registry Audit Gate (LEAD-TO-PLAN)
 * SD-LEARN-FIX-ADDRESS-PAT-LES-015 (PAT-LES-5b719daf1d9b)
 */

import { describe, it, expect } from 'vitest';
import {
  computeNearMissFindings,
  scoreFindings,
  findingsToWarnings,
  auditPhases,
  createGateRegistryAuditGate,
} from './gate-registry-audit.js';
import { createMockSD, createMockSupabase } from '../../../../../../tests/factories/validator-context-factory.js';

describe('computeNearMissFindings (FR-2, TS-1)', () => {
  it('flags a gate DISABLED for a sibling sd_type with no row for this sd_type', () => {
    const registryRows = [{ gate_key: 'GATE_X', sd_type: 'feature', applicability: 'DISABLED' }];
    const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'infrastructure');
    expect(findings).toEqual([{ type: 'NEAR_MISS', gate_key: 'GATE_X', disabled_for_sd_types: ['feature'] }]);
  });

  it('does not flag the sibling sd_type itself (it already has its own decision)', () => {
    const registryRows = [{ gate_key: 'GATE_X', sd_type: 'feature', applicability: 'DISABLED' }];
    const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'feature');
    expect(findings).toEqual([]);
  });

  it('never flags a gate_key with no registry rows at all (plain absence)', () => {
    const findings = computeNearMissFindings(new Set(['GATE_Y']), [], 'infrastructure');
    expect(findings).toEqual([]);
  });

  it.each(['REQUIRED', 'OPTIONAL', 'OPTIONAL_OVERRIDE'])(
    'does not flag a gate_key when this sd_type already has its own %s row, even with a sibling DISABLED row',
    (applicability) => {
      const registryRows = [
        { gate_key: 'GATE_X', sd_type: 'feature', applicability: 'DISABLED' },
        { gate_key: 'GATE_X', sd_type: 'infrastructure', applicability },
      ];
      const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'infrastructure');
      expect(findings).toEqual([]);
    }
  );

  it('excludes sd_type=NULL rows from the sibling-disabled map (validation_profile-scoped, not a concrete sd_type decision)', () => {
    const registryRows = [{ gate_key: 'GATE_X', sd_type: null, applicability: 'DISABLED' }];
    const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'infrastructure');
    expect(findings).toEqual([]);
  });

  it("excludes sd_type='all' rows from the sibling-disabled map (dead-by-construction in the live resolver)", () => {
    const registryRows = [{ gate_key: 'GATE_X', sd_type: 'all', applicability: 'DISABLED' }];
    const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'infrastructure');
    expect(findings).toEqual([]);
  });

  it('collects multiple distinct sibling sd_types for the same gate_key', () => {
    const registryRows = [
      { gate_key: 'GATE_X', sd_type: 'feature', applicability: 'DISABLED' },
      { gate_key: 'GATE_X', sd_type: 'bugfix', applicability: 'DISABLED' },
    ];
    const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'infrastructure');
    expect(findings).toHaveLength(1);
    expect(findings[0].disabled_for_sd_types.sort()).toEqual(['bugfix', 'feature']);
  });

  it('only considers gate_keys present in the known universe (ignores registry rows for gates not in this manifest)', () => {
    const registryRows = [{ gate_key: 'GATE_NOT_IN_UNIVERSE', sd_type: 'feature', applicability: 'DISABLED' }];
    const findings = computeNearMissFindings(new Set(['GATE_X']), registryRows, 'infrastructure');
    expect(findings).toEqual([]);
  });
});

describe('scoreFindings (FR-4, TS-3)', () => {
  it('returns 100 with zero findings', () => {
    expect(scoreFindings([])).toBe(100);
  });

  it('returns 90 with >=1 NEAR_MISS and zero AUDIT_INCOMPLETE', () => {
    const findings = [{ type: 'NEAR_MISS', gate_key: 'GATE_X', disabled_for_sd_types: ['feature'] }];
    expect(scoreFindings(findings)).toBe(90);
  });

  it('returns 85 with >=1 AUDIT_INCOMPLETE and zero NEAR_MISS', () => {
    const findings = [{ type: 'AUDIT_INCOMPLETE', phase: 'PLAN-TO-EXEC', error: 'boom' }];
    expect(scoreFindings(findings)).toBe(85);
  });

  it('returns 85 when BOTH NEAR_MISS and AUDIT_INCOMPLETE are present -- AUDIT_INCOMPLETE wins the tie-break', () => {
    const findings = [
      { type: 'NEAR_MISS', gate_key: 'GATE_X', disabled_for_sd_types: ['feature'] },
      { type: 'AUDIT_INCOMPLETE', phase: 'PLAN-TO-EXEC', error: 'boom' },
    ];
    expect(scoreFindings(findings)).toBe(85);
  });
});

describe('findingsToWarnings (FR-3 AC#3)', () => {
  it('derives one warning string per finding, prefixed to match its type', () => {
    const findings = [
      { type: 'NEAR_MISS', gate_key: 'GATE_X', disabled_for_sd_types: ['feature'] },
      { type: 'AUDIT_INCOMPLETE', phase: 'PLAN-TO-EXEC', error: 'boom' },
    ];
    const warnings = findingsToWarnings(findings);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/^NEAR_MISS: GATE_X/);
    expect(warnings[1]).toMatch(/^AUDIT_INCOMPLETE: registry audit for PLAN-TO-EXEC/);
  });

  it('returns an empty array for zero findings', () => {
    expect(findingsToWarnings([])).toEqual([]);
  });
});

describe('auditPhases (FR-1, FR-3, TS-2)', () => {
  function makeManifest(names) {
    return { success: true, manifest: names.map((name) => ({ name })) };
  }

  it('collects the union of manifest gate names across all 5 phases', async () => {
    const orchestrator = {
      dryRunHandoff: async (phase) => {
        if (phase === 'LEAD-TO-PLAN') return makeManifest(['GATE_A', 'GATE_B']);
        if (phase === 'PLAN-TO-EXEC') return makeManifest(['GATE_B', 'GATE_C']);
        return makeManifest([]);
      },
    };
    const { manifestNames, auditIncompletePhases } = await auditPhases(orchestrator, 'sd-1');
    expect([...manifestNames].sort()).toEqual(['GATE_A', 'GATE_B', 'GATE_C']);
    expect(auditIncompletePhases).toEqual([]);
  });

  it('calls dryRunHandoff for all 5 phase names', async () => {
    const calledPhases = [];
    const orchestrator = {
      dryRunHandoff: async (phase) => {
        calledPhases.push(phase);
        return makeManifest([]);
      },
    };
    await auditPhases(orchestrator, 'sd-1');
    expect(calledPhases.sort()).toEqual(
      ['EXEC-TO-PLAN', 'LEAD-FINAL-APPROVAL', 'LEAD-TO-PLAN', 'PLAN-TO-EXEC', 'PLAN-TO-LEAD'].sort()
    );
  });

  it('names the specific phase when dryRunHandoff throws for exactly one phase', async () => {
    const orchestrator = {
      dryRunHandoff: async (phase) => {
        if (phase === 'PLAN-TO-EXEC') throw new Error('boom');
        return makeManifest(['GATE_A']);
      },
    };
    const { manifestNames, auditIncompletePhases } = await auditPhases(orchestrator, 'sd-1');
    expect(auditIncompletePhases).toEqual([{ phase: 'PLAN-TO-EXEC', error: 'boom' }]);
    expect(manifestNames.has('GATE_A')).toBe(true);
  });

  it('names the specific phase when dryRunHandoff returns {success:false} for one phase', async () => {
    const orchestrator = {
      dryRunHandoff: async (phase) => {
        if (phase === 'PLAN-TO-LEAD') return { success: false, error: 'SD not found' };
        return makeManifest([]);
      },
    };
    const { auditIncompletePhases } = await auditPhases(orchestrator, 'sd-1');
    expect(auditIncompletePhases).toEqual([{ phase: 'PLAN-TO-LEAD', error: 'SD not found' }]);
  });

  it('records all 5 phases as incomplete when dryRunHandoff throws for every phase', async () => {
    const orchestrator = { dryRunHandoff: async () => { throw new Error('down'); } };
    const { manifestNames, auditIncompletePhases } = await auditPhases(orchestrator, 'sd-1');
    expect(manifestNames.size).toBe(0);
    expect(auditIncompletePhases).toHaveLength(5);
    expect(auditIncompletePhases.every((p) => p.error === 'down')).toBe(true);
  });
});

describe('createGateRegistryAuditGate (end-to-end wiring)', () => {
  it('is never blocking: required:false on the gate object', () => {
    const gate = createGateRegistryAuditGate(createMockSupabase());
    expect(gate.required).toBe(false);
    expect(gate.name).toBe('GATE_REGISTRY_AUDIT');
  });

  it('returns a clean pass with zero findings when no near-misses or audit failures exist', async () => {
    const supabase = createMockSupabase({ selectData: [] });
    const orchestratorFactory = async () => ({
      dryRunHandoff: async () => ({ success: true, manifest: [{ name: 'GATE_A' }] }),
    });
    const gate = createGateRegistryAuditGate(supabase, { orchestratorFactory });
    const result = await gate.validator({ sd: createMockSD({ sd_type: 'infrastructure' }) });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.maxScore).toBe(100);
    expect(result.findings).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('surfaces a NEAR_MISS finding end-to-end and stays passed:true', async () => {
    const supabase = createMockSupabase({
      selectData: [{ gate_key: 'GATE_X', sd_type: 'feature', applicability: 'DISABLED' }],
    });
    const orchestratorFactory = async () => ({
      dryRunHandoff: async () => ({ success: true, manifest: [{ name: 'GATE_X' }] }),
    });
    const gate = createGateRegistryAuditGate(supabase, { orchestratorFactory });
    const result = await gate.validator({ sd: createMockSD({ sd_type: 'infrastructure' }) });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(90);
    expect(result.findings).toEqual([{ type: 'NEAR_MISS', gate_key: 'GATE_X', disabled_for_sd_types: ['feature'] }]);
    expect(result.warnings).toHaveLength(1);
  });

  it('never fabricates an audit for a context with no persisted SD (no id/sd_type)', async () => {
    const gate = createGateRegistryAuditGate(createMockSupabase());
    const result = await gate.validator({ sd: null });
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.findings).toEqual([]);
  });

  it('marks every phase AUDIT_INCOMPLETE when the registry query itself fails, even if all 5 phase manifests succeeded', async () => {
    const supabase = createMockSupabase({ selectError: { message: 'db down' } });
    const orchestratorFactory = async () => ({
      dryRunHandoff: async () => ({ success: true, manifest: [{ name: 'GATE_A' }] }),
    });
    const gate = createGateRegistryAuditGate(supabase, { orchestratorFactory });
    const result = await gate.validator({ sd: createMockSD({ sd_type: 'infrastructure' }) });

    expect(result.passed).toBe(true);
    expect(result.score).toBe(85);
    expect(result.findings.filter((f) => f.type === 'AUDIT_INCOMPLETE')).toHaveLength(5);
    expect(result.findings.filter((f) => f.type === 'NEAR_MISS')).toHaveLength(0);
  });
});
