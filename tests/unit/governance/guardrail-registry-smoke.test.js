/**
 * Guardrail Registry Smoke Tests
 * Part of SD-MAN-GEN-CORRECTIVE-VISION-GAP-001
 *
 * Validates that guardrail-registry.js is functional:
 * list() returns expected guardrails, check() produces correct
 * violation structure, register() is no longer exported (bypass vector removed).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { list, check, _test, MODES } from '../../../lib/governance/guardrail-registry.js';
const { reset } = _test;

describe('Guardrail Registry Smoke Tests', () => {
  beforeEach(() => {
    reset(); // Restore defaults before each test
  });

  describe('list()', () => {
    it('returns at least 9 default guardrails', () => {
      const guardrails = list();
      expect(guardrails.length).toBeGreaterThanOrEqual(9);
    });

    it('each guardrail has id, name, mode, description', () => {
      const guardrails = list();
      for (const g of guardrails) {
        expect(g).toHaveProperty('id');
        expect(g).toHaveProperty('name');
        expect(g).toHaveProperty('mode');
        expect(g).toHaveProperty('description');
        expect(typeof g.id).toBe('string');
        expect(typeof g.name).toBe('string');
        expect(['blocking', 'advisory']).toContain(g.mode);
        expect(typeof g.description).toBe('string');
      }
    });

    it('includes expected guardrail IDs', () => {
      const ids = list().map(g => g.id);
      expect(ids).toContain('GR-VISION-ALIGNMENT');
      expect(ids).toContain('GR-SCOPE-BOUNDARY');
      expect(ids).toContain('GR-GOVERNANCE-CASCADE');
      expect(ids).toContain('GR-RISK-ASSESSMENT');
      expect(ids).toContain('GR-CORRECTIVE-EXEMPT');
      expect(ids).toContain('GR-BULK-SD-BLOCK');
      expect(ids).toContain('GR-ORCHESTRATOR-ARCH-PLAN');
      expect(ids).toContain('GR-BRAINSTORM-INTENT');
    });
  });

  describe('check()', () => {
    it('returns {passed, violations, warnings} structure', () => {
      const result = check({});
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('warnings');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('GR-VISION-ALIGNMENT triggers on visionScore < 30', () => {
      const result = check({ visionScore: 10 });
      expect(result.passed).toBe(false);
      const violation = result.violations.find(v => v.guardrail === 'GR-VISION-ALIGNMENT');
      expect(violation).toBeDefined();
      expect(violation.severity).toBe('critical');
      expect(violation.mode).toBe('blocking');
    });

    it('GR-VISION-ALIGNMENT passes on visionScore >= 30', () => {
      const result = check({ visionScore: 50, strategic_objectives: ['OKR-1'] });
      const violation = result.violations.find(v => v.guardrail === 'GR-VISION-ALIGNMENT');
      expect(violation).toBeUndefined();
    });

    it('GR-GOVERNANCE-CASCADE triggers on missing strategic_objectives and parent_sd_id', () => {
      const result = check({ strategic_objectives: [], parent_sd_id: null });
      const violation = result.violations.find(v => v.guardrail === 'GR-GOVERNANCE-CASCADE');
      expect(violation).toBeDefined();
      expect(violation.severity).toBe('high');
    });

    it('GR-GOVERNANCE-CASCADE passes with parent_sd_id', () => {
      const result = check({ parent_sd_id: 'some-parent' });
      const violation = result.violations.find(v => v.guardrail === 'GR-GOVERNANCE-CASCADE');
      expect(violation).toBeUndefined();
    });

    it('GR-CORRECTIVE-EXEMPT exempts corrective SDs', () => {
      const result = check({
        visionScore: 10, // Would normally trigger GR-VISION-ALIGNMENT
        metadata: { source: 'corrective_sd_generator' },
      });
      // Corrective exempt guardrail should mark as exempt, not violated
      const exempt = result.violations.find(v => v.guardrail === 'GR-CORRECTIVE-EXEMPT');
      expect(exempt).toBeUndefined(); // Exempt means no violation entry
    });

    it('GR-RISK-ASSESSMENT generates advisory warning for high priority without risks', () => {
      const result = check({
        priority: 'high',
        risks: [],
        strategic_objectives: ['OKR-1'],
      });
      const warning = result.warnings.find(w => w.guardrail === 'GR-RISK-ASSESSMENT');
      expect(warning).toBeDefined();
      expect(warning.mode).toBe('advisory');
    });


    it('violations have correct entry structure', () => {
      const result = check({ visionScore: 5 });
      expect(result.violations.length).toBeGreaterThan(0);
      const v = result.violations[0];
      expect(v).toHaveProperty('guardrail');
      expect(v).toHaveProperty('name');
      expect(v).toHaveProperty('mode');
      expect(v).toHaveProperty('severity');
      expect(v).toHaveProperty('message');
    });
  });

  describe('register() removed (SD-LEO-GEN-ENFORCE-GOVERNANCE-GUARDRAILS-001)', () => {
    it('is no longer a public export — runtime guardrail replacement was a bypass vector', async () => {
      const mod = await import('../../../lib/governance/guardrail-registry.js');
      expect(mod.register).toBeUndefined();
    });

    it('is no longer in _test exports', () => {
      expect(_test.register).toBeUndefined();
    });
  });

  describe('reset()', () => {
    it('restores default guardrail count', () => {
      const defaultCount = list().length;
      reset();
      expect(list().length).toBe(defaultCount);
    });
  });

  describe('MODES constant', () => {
    it('exports BLOCKING and ADVISORY modes', () => {
      expect(MODES.BLOCKING).toBe('blocking');
      expect(MODES.ADVISORY).toBe('advisory');
    });
  });
});
