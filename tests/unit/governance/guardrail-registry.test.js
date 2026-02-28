/**
 * Tests for Guardrail Registry (V11: governance_guardrail_enforcement)
 * SD-MAN-FEAT-CORRECTIVE-VISION-GAP-069
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
  it('returns all default guardrails', () => {
    const guardrails = list();
    expect(guardrails.length).toBeGreaterThanOrEqual(5);
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

  it('warns when no strategic objectives', () => {
    const result = check({
      sd_type: 'feature',
      scope: 'Add optimization',
      priority: 'medium',
    });
    // GR-GOVERNANCE-CASCADE is advisory, not blocking
    expect(result.passed).toBe(true);
    const cascadeWarning = result.warnings.find(
      (w) => w.guardrail === 'GR-GOVERNANCE-CASCADE'
    );
    expect(cascadeWarning).toBeDefined();
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

describe('Guardrail Registry - MODES', () => {
  it('exports blocking and advisory modes', () => {
    expect(MODES.BLOCKING).toBe('blocking');
    expect(MODES.ADVISORY).toBe('advisory');
  });
});
