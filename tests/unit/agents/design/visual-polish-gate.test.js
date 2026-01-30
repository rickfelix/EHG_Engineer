/**
 * Visual Polish Gate Unit Tests
 * @sd SD-LEO-ORCH-AESTHETIC-DESIGN-SYSTEM-001-C
 */

import { describe, it, expect } from 'vitest';
import {
  AI_SLOP_PATTERNS,
  STAGE_ENFORCEMENT,
  CRITIQUE_DIMENSIONS,
  PERSONALITY_CONSTRAINTS,
  detectAISlop,
  auditPersonalityCompliance,
  getEnforcementDecision,
  generateImpeccableCritique,
  executeVisualPolishGate,
  formatGateResult
} from '../../../../lib/agents/design-sub-agent/visual-polish-gate.js';

describe('Visual Polish Gate', () => {
  describe('AI Slop Detection', () => {
    it('should detect purple gradient patterns in CSS', () => {
      const cssContent = `
        .hero {
          background: linear-gradient(to right, #8B5CF6, #A855F7);
        }
      `;

      const violations = detectAISlop(cssContent, 'css');

      expect(violations.length).toBeGreaterThan(0);
      expect(violations.some(v => v.type === 'PURPLE_GRADIENT')).toBe(true);
    });

    it('should detect purple Tailwind classes in JSX', () => {
      const jsxContent = `
        <div className="bg-violet-500 hover:bg-violet-600">
          Gradient button
        </div>
      `;

      const violations = detectAISlop(jsxContent, 'jsx');

      expect(violations.some(v => v.type === 'PURPLE_GRADIENT')).toBe(true);
    });

    it('should detect pure gray hex colors', () => {
      const cssContent = `
        .text {
          color: #808080;
          border-color: #666666;
        }
      `;

      const violations = detectAISlop(cssContent, 'css');

      expect(violations.some(v => v.type === 'PURE_GRAY')).toBe(true);
    });

    it('should detect nested card patterns in JSX', () => {
      const jsxContent = `
        <Card>
          <CardContent>
            <Card>
              <CardContent>Nested content</CardContent>
            </Card>
          </CardContent>
        </Card>
      `;

      const violations = detectAISlop(jsxContent, 'jsx');

      expect(violations.some(v => v.type === 'NESTED_CARDS')).toBe(true);
    });

    it('should detect default font usage', () => {
      const cssContent = `
        body {
          font-family: Arial, sans-serif;
        }
      `;

      const violations = detectAISlop(cssContent, 'css');

      expect(violations.some(v => v.type === 'DEFAULT_FONTS')).toBe(true);
    });

    it('should return empty array for clean content', () => {
      const cleanContent = `
        <div className="bg-blue-500 text-white p-4 rounded-lg">
          Clean button with custom colors
        </div>
      `;

      const violations = detectAISlop(cleanContent, 'jsx');

      // May have some minor violations but not purple gradient
      expect(violations.some(v => v.type === 'PURPLE_GRADIENT')).toBe(false);
    });
  });

  describe('Stage Enforcement', () => {
    it('should return ADVISORY for ideation stage', () => {
      const violations = [{ type: 'PURPLE_GRADIENT', severity: 'MEDIUM' }];
      const decision = getEnforcementDecision('ideation', violations);

      expect(decision.action).toBe('ADVISORY');
      expect(decision.exitCode).toBe(0);
    });

    it('should return WARNING for build stage', () => {
      const violations = [{ type: 'PURE_GRAY', severity: 'LOW' }];
      const decision = getEnforcementDecision('build', violations);

      expect(decision.action).toBe('WARNING');
      expect(decision.exitCode).toBe(0);
    });

    it('should return HARD_BLOCK for launch stage', () => {
      const violations = [{ type: 'PURPLE_GRADIENT', severity: 'MEDIUM' }];
      const decision = getEnforcementDecision('launch', violations);

      expect(decision.action).toBe('HARD_BLOCK');
      expect(decision.exitCode).toBe(1);
    });

    it('should return PASS when no violations', () => {
      const violations = [];
      const decision = getEnforcementDecision('launch', violations);

      expect(decision.action).toBe('PASS');
      expect(decision.exitCode).toBe(0);
    });

    it('should escalate high severity to WARNING in non-launch stages', () => {
      const violations = [{ type: 'CRITICAL_PATTERN', severity: 'HIGH' }];
      const decision = getEnforcementDecision('build', violations);

      expect(decision.action).toBe('WARNING');
      expect(decision.escalated).toBe(true);
    });
  });

  describe('Personality Audit', () => {
    it('should audit against spartan constraints', () => {
      const content = `
        <div className="shadow-lg rounded-xl bg-gradient-to-r animate-pulse">
          Fancy card
        </div>
      `;

      const audit = auditPersonalityCompliance(content, 'spartan');

      expect(audit.personality).toBe('spartan');
      expect(audit.status).toBe('VIOLATIONS_FOUND');
      expect(audit.violations.length).toBeGreaterThan(0);
    });

    it('should pass for compliant spartan content', () => {
      const content = `
        <div className="border p-2 font-mono">
          Minimal interface
        </div>
      `;

      const audit = auditPersonalityCompliance(content, 'spartan');

      expect(audit.complianceScore).toBeGreaterThanOrEqual(50);
    });

    it('should skip unknown personality', () => {
      const content = '<div>Content</div>';
      const audit = auditPersonalityCompliance(content, 'unknown-personality');

      expect(audit.status).toBe('SKIPPED');
      expect(audit.reason).toContain('No constraints defined');
    });

    it('should check required patterns for accessible personality', () => {
      const content = `
        <button className="focus:ring-2 focus:ring-blue-500">
          <span className="sr-only">Submit form</span>
          Submit
        </button>
      `;

      const audit = auditPersonalityCompliance(content, 'accessible');

      expect(audit.passed.some(p => p.type === 'REQUIRED_PATTERN')).toBe(true);
    });

    it('should flag forbidden patterns for enterprise', () => {
      const content = `
        <div className="bg-pink-500 rounded-full animate-bounce">
          Playful but not enterprise
        </div>
      `;

      const audit = auditPersonalityCompliance(content, 'enterprise');

      expect(audit.violations.some(v => v.type === 'FORBIDDEN_PATTERN')).toBe(true);
    });
  });

  describe('Impeccable Critique', () => {
    it('should generate critique report with all dimensions', () => {
      const analysis = {
        hierarchy: { headingSizes: 80, visualWeight: 75, whitespace: 70, alignment: 85 },
        clarity: { labelClarity: 90, actionClarity: 85, errorStates: 60, loadingStates: 75 },
        emotionalResonance: { brandAlignment: 80, toneConsistency: 75, microInteractions: 70, imagery: 65 }
      };

      const critique = generateImpeccableCritique(analysis);

      expect(critique.dimensions).toHaveProperty('hierarchy');
      expect(critique.dimensions).toHaveProperty('clarity');
      expect(critique.dimensions).toHaveProperty('emotionalResonance');
      expect(critique.overallScore).toBeGreaterThan(0);
      expect(critique.overallScore).toBeLessThanOrEqual(100);
    });

    it('should provide suggestions for low-scoring dimensions', () => {
      const analysis = {
        hierarchy: { headingSizes: 40, visualWeight: 35, whitespace: 30, alignment: 45 },
        clarity: { labelClarity: 90, actionClarity: 85, errorStates: 80, loadingStates: 75 },
        emotionalResonance: { brandAlignment: 80, toneConsistency: 75, microInteractions: 70, imagery: 65 }
      };

      const critique = generateImpeccableCritique(analysis);

      expect(critique.suggestions.length).toBeGreaterThan(0);
      expect(critique.suggestions.some(s => s.dimension === 'Hierarchy')).toBe(true);
    });

    it('should use default scores when analysis is null', () => {
      const critique = generateImpeccableCritique(null);

      expect(critique.overallScore).toBe(70); // Default 70% for all dimensions
    });
  });

  describe('Gate Execution', () => {
    it('should execute gate and return comprehensive result', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="p-4 bg-blue-500">Clean button</div>',
        fileType: 'jsx',
        ventureStage: 'build'
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('aiSlop');
      expect(result).toHaveProperty('critique');
      expect(result.gate).toBe('VISUAL_POLISH_GATE');
    });

    it('should return HARD_BLOCK for launch stage with violations', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="bg-violet-500 from-purple-500 to-indigo-600">AI content</div>',
        fileType: 'jsx',
        ventureStage: 'launch'
      });

      expect(result.status).toBe('HARD_BLOCK');
      expect(result.exitCode).toBe(1);
    });

    it('should include personality audit when personality provided', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="font-mono border">Spartan design</div>',
        fileType: 'jsx',
        ventureStage: 'build',
        venturePersonality: 'spartan'
      });

      expect(result.personalityAudit).not.toBeNull();
      expect(result.personalityAudit.personality).toBe('spartan');
    });

    it('should return EXCELLENT for high-scoring clean content', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="p-4 bg-slate-100">Clean design</div>',
        fileType: 'jsx',
        ventureStage: 'ideation',
        analysis: {
          hierarchy: { headingSizes: 95, visualWeight: 90, whitespace: 92, alignment: 95 },
          clarity: { labelClarity: 95, actionClarity: 90, errorStates: 88, loadingStates: 92 },
          emotionalResonance: { brandAlignment: 92, toneConsistency: 90, microInteractions: 88, imagery: 90 }
        }
      });

      expect(result.score).toBeGreaterThanOrEqual(90);
      expect(result.status).toBe('EXCELLENT');
    });
  });

  describe('Constants', () => {
    it('should have all required AI slop patterns', () => {
      expect(AI_SLOP_PATTERNS).toHaveProperty('PURPLE_GRADIENT');
      expect(AI_SLOP_PATTERNS).toHaveProperty('PURE_GRAY');
      expect(AI_SLOP_PATTERNS).toHaveProperty('NESTED_CARDS');
      expect(AI_SLOP_PATTERNS).toHaveProperty('DEFAULT_FONTS');
    });

    it('should have stage enforcement for all stages', () => {
      expect(STAGE_ENFORCEMENT).toHaveProperty('ideation');
      expect(STAGE_ENFORCEMENT).toHaveProperty('validation');
      expect(STAGE_ENFORCEMENT).toHaveProperty('build');
      expect(STAGE_ENFORCEMENT).toHaveProperty('launch');
    });

    it('should have all critique dimensions', () => {
      expect(CRITIQUE_DIMENSIONS).toHaveProperty('hierarchy');
      expect(CRITIQUE_DIMENSIONS).toHaveProperty('clarity');
      expect(CRITIQUE_DIMENSIONS).toHaveProperty('emotionalResonance');
    });

    it('should have personality constraints for key personalities', () => {
      expect(PERSONALITY_CONSTRAINTS).toHaveProperty('spartan');
      expect(PERSONALITY_CONSTRAINTS).toHaveProperty('enterprise');
      expect(PERSONALITY_CONSTRAINTS).toHaveProperty('accessible');
    });
  });

  describe('Format Output', () => {
    it('should format gate result for console', async () => {
      const result = await executeVisualPolishGate({
        content: '<div className="p-4">Test</div>',
        fileType: 'jsx',
        ventureStage: 'build'
      });

      const formatted = formatGateResult(result);

      expect(formatted).toContain('VISUAL POLISH GATE RESULT');
      expect(formatted).toContain('AI SLOP DETECTION');
      expect(formatted).toContain('IMPECCABLE CRITIQUE');
    });
  });
});
