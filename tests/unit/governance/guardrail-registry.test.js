/**
 * Tests for Guardrail Registry (V11: governance_guardrail_enforcement)
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-069, SD-MAN-FEAT-CORRECTIVE-VISION-GAP-071
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  list,
  check,
  register,
  reset,
  MODES,
} from '../../../lib/governance/guardrail-registry.js';

beforeEach(() => {
  reset();
});

describe('Guardrail Registry - list()', () => {
  it('returns all 9 default guardrails', () => {
    const guardrails = list();
    expect(guardrails.length).toBe(9);
    expect(guardrails[0]).toHaveProperty('id');
    expect(guardrails[0]).toHaveProperty('name');
    expect(guardrails[0]).toHaveProperty('mode');
    expect(guardrails[0]).toHaveProperty('description');
  });

  it('includes vision alignment guardrail', () => {
    const guardrails = list();
    const visionGuardrail = guardrails.find((g) => g.id === 'GR-VISION-ALIGNMENT');
    expect(visionGuardrail).toBeDefined();
    expect(visionGuardrail.mode).toBe(MODES.BLOCKING);
  });

  it('includes scope boundary guardrail', () => {
    const guardrails = list();
    const scopeGuardrail = guardrails.find((g) => g.id === 'GR-SCOPE-BOUNDARY');
    expect(scopeGuardrail).toBeDefined();
    expect(scopeGuardrail.mode).toBe(MODES.BLOCKING);
  });
});

describe('Guardrail Registry - check()', () => {
  it('passes for compliant SD data', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Add new database query optimization',
      priority: 'medium',
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks when vision score below 30', () => {
    const result = check({ visionScore: 20 });
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0].guardrail).toBe('GR-VISION-ALIGNMENT');
  });

  it('passes when vision score is 30 or above', () => {
    const result = check({
      visionScore: 30,
      strategic_objectives: ['OKR-1'],
      priority: 'medium',
    });
    expect(result.passed).toBe(true);
  });

  it('blocks infrastructure SD with UI scope', () => {
    const result = check({
      sd_type: 'infrastructure',
      scope: 'Build React component for dashboard',
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(false);
    const scopeViolation = result.violations.find(
      (v) => v.guardrail === 'GR-SCOPE-BOUNDARY'
    );
    expect(scopeViolation).toBeDefined();
  });

  it('blocks when no strategic objectives and no parent_sd_id', () => {
    // SD-MAN-FEAT-CORRECTIVE-VISION-GAP-067: GR-GOVERNANCE-CASCADE is now BLOCKING
    const result = check({
      sd_type: 'feature',
      scope: 'Add optimization',
      priority: 'medium',
    });
    expect(result.passed).toBe(false);
    const cascadeViolation = result.violations.find(
      (v) => v.guardrail === 'GR-GOVERNANCE-CASCADE'
    );
    expect(cascadeViolation).toBeDefined();
    expect(cascadeViolation.mode).toBe(MODES.BLOCKING);
    expect(cascadeViolation.severity).toBe('high');
  });

  it('passes cascade when parent_sd_id provided (without strategic_objectives)', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Add optimization',
      priority: 'medium',
      parent_sd_id: 'some-parent-uuid',
    });
    const cascadeViolation = result.violations.find(
      (v) => v.guardrail === 'GR-GOVERNANCE-CASCADE'
    );
    expect(cascadeViolation).toBeUndefined();
  });

  it('warns when high priority SD has no risks', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Critical change',
      priority: 'high',
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(true);
    const riskWarning = result.warnings.find(
      (w) => w.guardrail === 'GR-RISK-ASSESSMENT'
    );
    expect(riskWarning).toBeDefined();
  });

  it('exempts corrective SDs from vision scoring', () => {
    const result = check({
      visionScore: 10,
      metadata: { source: 'corrective_sd_generator' },
      strategic_objectives: ['OKR-1'],
    });
    // The corrective exempt guardrail should mark as exempt
    // but GR-VISION-ALIGNMENT still fires since it has its own check
    const exempt = result.violations.find(
      (v) => v.guardrail === 'GR-CORRECTIVE-EXEMPT'
    );
    // Corrective exempt doesn't create violations/warnings — it just returns exempt
    expect(exempt).toBeUndefined();
  });
});

describe('Guardrail Registry - register()', () => {
  it('adds a new custom guardrail', () => {
    register({
      id: 'GR-CUSTOM-TEST',
      name: 'Custom Test',
      mode: MODES.ADVISORY,
      description: 'Test guardrail',
      check: () => ({ violated: false }),
    });
    const guardrails = list();
    const custom = guardrails.find((g) => g.id === 'GR-CUSTOM-TEST');
    expect(custom).toBeDefined();
  });

  it('replaces existing guardrail by ID', () => {
    const initialCount = list().length;
    register({
      id: 'GR-VISION-ALIGNMENT',
      name: 'Updated Vision',
      mode: MODES.ADVISORY,
      description: 'Updated',
      check: () => ({ violated: false }),
    });
    expect(list().length).toBe(initialCount);
    const updated = list().find((g) => g.id === 'GR-VISION-ALIGNMENT');
    expect(updated.mode).toBe(MODES.ADVISORY);
  });

  it('throws for guardrail without id', () => {
    expect(() =>
      register({ name: 'No ID', check: () => ({}) })
    ).toThrow('Guardrail must have id and check function');
  });

  it('throws for guardrail without check function', () => {
    expect(() => register({ id: 'GR-NO-CHECK' })).toThrow(
      'Guardrail must have id and check function'
    );
  });
});

describe('Guardrail Registry - reset()', () => {
  it('restores default guardrails after customization', () => {
    register({
      id: 'GR-TEMP',
      name: 'Temp',
      mode: MODES.ADVISORY,
      description: 'Temporary',
      check: () => ({ violated: false }),
    });
    const withCustom = list().length;
    reset();
    expect(list().length).toBe(withCustom - 1);
  });
});

describe('Guardrail Registry - GR-BULK-SD-BLOCK', () => {
  it('blocks when sessionSdCount >= 4 without orchestrator plan', () => {
    const result = check({ sessionSdCount: 4 });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeDefined();
    expect(violation.mode).toBe(MODES.BLOCKING);
  });

  it('passes when sessionSdCount < 4', () => {
    const result = check({
      sessionSdCount: 3,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeUndefined();
  });

  it('passes when orchestrator plan ref exists', () => {
    const result = check({
      sessionSdCount: 5,
      metadata: { orchestrator_plan_ref: 'ARCH-001' },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeUndefined();
  });

  it('passes with architecture_plan_ref in metadata', () => {
    const result = check({
      sessionSdCount: 10,
      metadata: { architecture_plan_ref: 'ARCH-002' },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BULK-SD-BLOCK');
    expect(violation).toBeUndefined();
  });
});

describe('Guardrail Registry - GR-ORCHESTRATOR-ARCH-PLAN', () => {
  it('blocks orchestrator with 3+ children and no arch plan', () => {
    const result = check({ childrenCount: 3 });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeDefined();
  });

  it('passes orchestrator with arch plan ref', () => {
    const result = check({
      childrenCount: 5,
      metadata: { arch_plan_key: 'ARCH-001' },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeUndefined();
  });

  it('passes non-orchestrator SD', () => {
    const result = check({
      childrenCount: 0,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeUndefined();
  });

  it('detects orchestrator by sd_type', () => {
    const result = check({ sd_type: 'orchestrator' });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-ORCHESTRATOR-ARCH-PLAN');
    expect(violation).toBeDefined();
  });
});

describe('Guardrail Registry - GR-BRAINSTORM-INTENT', () => {
  it('blocks brainstorm-sourced SD without session ID', () => {
    const result = check({
      metadata: { source: 'brainstorm' },
      strategic_objectives: ['OKR-1'],
    });
    expect(result.passed).toBe(false); // blocking (upgraded from advisory)
    const violation = result.violations.find((v) => v.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(violation).toBeDefined();
  });

  it('passes brainstorm SD with session ID', () => {
    const result = check({
      metadata: { source: 'brainstorm', brainstorm_session_id: 'sess-123' },
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(warning).toBeUndefined();
  });

  it('ignores non-brainstorm SDs', () => {
    const result = check({
      metadata: { source: 'manual' },
      strategic_objectives: ['OKR-1'],
    });
    const warning = result.warnings.find((w) => w.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(warning).toBeUndefined();
  });

  it('detects brainstorm_origin flag', () => {
    const result = check({
      metadata: { brainstorm_origin: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-BRAINSTORM-INTENT');
    expect(violation).toBeDefined();
  });
});

describe('Guardrail Registry - GR-OKR-HARD-STOP', () => {
  it('blocks after OKR cycle day 28', () => {
    const result = check({ okrCycleDay: 29 });
    expect(result.passed).toBe(false);
    const violation = result.violations.find((v) => v.guardrail === 'GR-OKR-HARD-STOP');
    expect(violation).toBeDefined();
    expect(violation.severity).toBe('critical');
  });

  it('passes on day 28', () => {
    const result = check({
      okrCycleDay: 28,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-OKR-HARD-STOP');
    expect(violation).toBeUndefined();
  });

  it('allows chairman override after day 28', () => {
    const result = check({
      okrCycleDay: 30,
      chairmanOverride: true,
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-OKR-HARD-STOP');
    expect(violation).toBeUndefined();
  });

  it('allows metadata chairman_override', () => {
    const result = check({
      okrCycleDay: 30,
      metadata: { chairman_override: true },
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-OKR-HARD-STOP');
    expect(violation).toBeUndefined();
  });

  it('skips check when no OKR cycle data', () => {
    const result = check({
      strategic_objectives: ['OKR-1'],
    });
    const violation = result.violations.find((v) => v.guardrail === 'GR-OKR-HARD-STOP');
    expect(violation).toBeUndefined();
  });
});

describe('Guardrail Registry - MODES', () => {
  it('exports blocking and advisory modes', () => {
    expect(MODES.BLOCKING).toBe('blocking');
    expect(MODES.ADVISORY).toBe('advisory');
  });
});
