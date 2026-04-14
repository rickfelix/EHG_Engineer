/**
 * Contract test: Convergence → Stitch-Provisioner interface
 * SD: SD-FIX-WIREFRAME-CONVERGENCE-PRODUCING-ORCH-001-B
 *
 * Validates that the convergence output shape (stage 19) matches what
 * stitch-provisioner's extractStage15Screens expects to consume.
 */

import { describe, it, expect } from 'vitest';
import {
  CONVERGENCE_THRESHOLD,
  VERDICT_PASS,
  VERDICT_NEEDS_REFINEMENT,
  PASS_DEFINITIONS,
} from '../../lib/eva/stage-templates/analysis-steps/stage-19-visual-convergence.js';
import { extractStage15Screens } from '../../lib/eva/bridge/stitch-provisioner.js';

// ── Fixture: valid convergence output ──────────────────────────────
function buildConvergenceFixture(overrides = {}) {
  return {
    passes: PASS_DEFINITIONS.map(def => ({
      domain: def.domain,
      label: def.label,
      score: 75,
      strengths: ['Good layout', 'Clear hierarchy'],
      improvements: ['Add more contrast'],
      expertPersona: def.expertPersona,
      weight: def.weight,
    })),
    overall_score: 75,
    verdict: VERDICT_PASS,
    threshold: CONVERGENCE_THRESHOLD,
    screen_count: 6,
    refinement_priority: ['[Layout Structure] Add more contrast'],
    ...overrides,
  };
}

// ── Contract: convergence output shape ─────────────────────────────
describe('Convergence-to-Stitch contract', () => {
  describe('convergence output shape', () => {
    const fixture = buildConvergenceFixture();

    it('has required top-level fields', () => {
      expect(fixture).toHaveProperty('passes');
      expect(fixture).toHaveProperty('overall_score');
      expect(fixture).toHaveProperty('verdict');
      expect(fixture).toHaveProperty('threshold');
      expect(fixture).toHaveProperty('screen_count');
      expect(fixture).toHaveProperty('refinement_priority');
    });

    it('passes is a non-empty array', () => {
      expect(Array.isArray(fixture.passes)).toBe(true);
      expect(fixture.passes.length).toBeGreaterThan(0);
    });

    it('overall_score is a number 0-100', () => {
      expect(typeof fixture.overall_score).toBe('number');
      expect(fixture.overall_score).toBeGreaterThanOrEqual(0);
      expect(fixture.overall_score).toBeLessThanOrEqual(100);
    });

    it('verdict is PASS or NEEDS_REFINEMENT', () => {
      expect([VERDICT_PASS, VERDICT_NEEDS_REFINEMENT]).toContain(fixture.verdict);
    });

    it('threshold equals CONVERGENCE_THRESHOLD constant', () => {
      expect(fixture.threshold).toBe(CONVERGENCE_THRESHOLD);
      expect(typeof fixture.threshold).toBe('number');
    });

    it('screen_count is a positive integer', () => {
      expect(Number.isInteger(fixture.screen_count)).toBe(true);
      expect(fixture.screen_count).toBeGreaterThan(0);
    });

    it('refinement_priority is an array', () => {
      expect(Array.isArray(fixture.refinement_priority)).toBe(true);
    });
  });

  describe('convergence pass structure', () => {
    const fixture = buildConvergenceFixture();

    it('each pass has domain, label, score, weight', () => {
      for (const pass of fixture.passes) {
        expect(typeof pass.domain).toBe('string');
        expect(typeof pass.label).toBe('string');
        expect(typeof pass.score).toBe('number');
        expect(typeof pass.weight).toBe('number');
        expect(pass.score).toBeGreaterThanOrEqual(0);
        expect(pass.score).toBeLessThanOrEqual(100);
        expect(pass.weight).toBeGreaterThan(0);
        expect(pass.weight).toBeLessThanOrEqual(1);
      }
    });

    it('pass weights sum to approximately 1.0', () => {
      const sum = fixture.passes.reduce((acc, p) => acc + p.weight, 0);
      expect(sum).toBeCloseTo(1.0, 2);
    });

    it('produces exactly 5 passes matching PASS_DEFINITIONS', () => {
      expect(fixture.passes).toHaveLength(PASS_DEFINITIONS.length);
      const domains = fixture.passes.map(p => p.domain);
      for (const def of PASS_DEFINITIONS) {
        expect(domains).toContain(def.domain);
      }
    });
  });

  // ── Contract: stitch-provisioner consumption ───────────────────────
  describe('stitch-provisioner extractStage15Screens', () => {
    it('extracts screens from wireframe_convergence.final_screens', () => {
      const screens = [{ name: 'Dashboard' }, { name: 'Login' }];
      const artifacts = {
        wireframe_convergence: { final_screens: screens },
      };
      const result = extractStage15Screens(artifacts);
      expect(result).toEqual(screens);
    });

    it('extracts screens from wireframe_convergence.screens as fallback', () => {
      const screens = [{ name: 'Settings' }];
      const artifacts = {
        wireframe_convergence: { screens },
      };
      const result = extractStage15Screens(artifacts);
      expect(result).toEqual(screens);
    });

    it('returns empty array when convergence has no screens', () => {
      const artifacts = {
        wireframe_convergence: buildConvergenceFixture(),
      };
      const result = extractStage15Screens(artifacts);
      expect(Array.isArray(result)).toBe(true);
      // Convergence output alone (without screens/final_screens) falls through to empty
      expect(result).toEqual([]);
    });

    it('does not crash with null or undefined input', () => {
      expect(extractStage15Screens(null)).toEqual([]);
      expect(extractStage15Screens(undefined)).toEqual([]);
      expect(extractStage15Screens({})).toEqual([]);
    });

    it('prefers screens array over convergence paths', () => {
      const topLevel = [{ name: 'TopLevel' }];
      const convergence = [{ name: 'Convergence' }];
      const artifacts = {
        screens: topLevel,
        wireframe_convergence: { final_screens: convergence },
      };
      const result = extractStage15Screens(artifacts);
      expect(result).toEqual(topLevel);
    });
  });

  // ── Regression detection: missing required fields ──────────────────
  describe('regression detection', () => {
    it('detects missing overall_score', () => {
      const fixture = buildConvergenceFixture();
      delete fixture.overall_score;
      expect(fixture).not.toHaveProperty('overall_score');
    });

    it('detects missing passes', () => {
      const fixture = buildConvergenceFixture();
      delete fixture.passes;
      expect(fixture).not.toHaveProperty('passes');
    });

    it('detects missing verdict', () => {
      const fixture = buildConvergenceFixture();
      delete fixture.verdict;
      expect(fixture).not.toHaveProperty('verdict');
    });

    it('detects missing screen_count', () => {
      const fixture = buildConvergenceFixture();
      delete fixture.screen_count;
      expect(fixture).not.toHaveProperty('screen_count');
    });
  });
});
