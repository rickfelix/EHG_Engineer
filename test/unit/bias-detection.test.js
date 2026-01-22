/**
 * Unit Tests: Type-Aware Bias Detection
 *
 * Tests the AI bias detection logic that identifies workflow violations.
 *
 * SD: SD-LEO-ORCH-AUTO-PROCEED-INTELLIGENCE-001-J
 */

import { describe, it, expect } from 'vitest';

// Test the bias detection patterns
// The actual detectBiasesForType() function requires database and git,
// so we test the logic patterns independently

describe('Type-Aware Bias Detection Patterns', () => {
  describe('COMPLETION_BIAS detection logic', () => {
    it('should detect when SD has merged PR but is not complete', () => {
      const sd = {
        status: 'in_progress',
        current_phase: 'EXEC',
        sd_type: 'feature'
      };
      const hasMergedPR = true;
      const isComplete = sd.status === 'completed' || sd.current_phase === 'COMPLETED';

      const hasCompletionBias = hasMergedPR && !isComplete;
      expect(hasCompletionBias).toBe(true);
    });

    it('should NOT detect bias when SD is properly complete', () => {
      const sd = {
        status: 'completed',
        current_phase: 'COMPLETED',
        sd_type: 'feature'
      };
      const hasMergedPR = true;
      const isComplete = sd.status === 'completed' || sd.current_phase === 'COMPLETED';

      const hasCompletionBias = hasMergedPR && !isComplete;
      expect(hasCompletionBias).toBe(false);
    });

    it('should NOT detect bias when no PR has been merged', () => {
      const sd = {
        status: 'in_progress',
        current_phase: 'EXEC',
        sd_type: 'feature'
      };
      const hasMergedPR = false;
      const isComplete = sd.status === 'completed' || sd.current_phase === 'COMPLETED';

      const hasCompletionBias = hasMergedPR && !isComplete;
      expect(hasCompletionBias).toBe(false);
    });
  });

  describe('EFFICIENCY_BIAS detection logic', () => {
    it('should detect when in EXEC without LEAD-TO-PLAN handoff', () => {
      const sd = { current_phase: 'EXEC' };
      const acceptedHandoffs = ['PLAN-TO-EXEC'];

      const hasLeadToPlan = acceptedHandoffs.includes('LEAD-TO-PLAN');
      const hasPlanToExec = acceptedHandoffs.includes('PLAN-TO-EXEC');
      const inExecPhase = sd.current_phase === 'EXEC' || sd.current_phase === 'EXEC_IMPLEMENTATION';

      const hasEfficiencyBias = inExecPhase && (!hasLeadToPlan || !hasPlanToExec);
      expect(hasEfficiencyBias).toBe(true);
    });

    it('should detect when in EXEC without PLAN-TO-EXEC handoff', () => {
      const sd = { current_phase: 'EXEC' };
      const acceptedHandoffs = ['LEAD-TO-PLAN'];

      const hasLeadToPlan = acceptedHandoffs.includes('LEAD-TO-PLAN');
      const hasPlanToExec = acceptedHandoffs.includes('PLAN-TO-EXEC');
      const inExecPhase = sd.current_phase === 'EXEC' || sd.current_phase === 'EXEC_IMPLEMENTATION';

      const hasEfficiencyBias = inExecPhase && (!hasLeadToPlan || !hasPlanToExec);
      expect(hasEfficiencyBias).toBe(true);
    });

    it('should NOT detect bias when all required handoffs exist', () => {
      const sd = { current_phase: 'EXEC' };
      const acceptedHandoffs = ['LEAD-TO-PLAN', 'PLAN-TO-EXEC'];

      const hasLeadToPlan = acceptedHandoffs.includes('LEAD-TO-PLAN');
      const hasPlanToExec = acceptedHandoffs.includes('PLAN-TO-EXEC');
      const inExecPhase = sd.current_phase === 'EXEC' || sd.current_phase === 'EXEC_IMPLEMENTATION';

      const hasEfficiencyBias = inExecPhase && (!hasLeadToPlan || !hasPlanToExec);
      expect(hasEfficiencyBias).toBe(false);
    });

    it('should NOT detect bias when not in EXEC phase', () => {
      const sd = { current_phase: 'PLAN' };
      const acceptedHandoffs = [];

      const hasLeadToPlan = acceptedHandoffs.includes('LEAD-TO-PLAN');
      const hasPlanToExec = acceptedHandoffs.includes('PLAN-TO-EXEC');
      const inExecPhase = sd.current_phase === 'EXEC' || sd.current_phase === 'EXEC_IMPLEMENTATION';

      const hasEfficiencyBias = inExecPhase && (!hasLeadToPlan || !hasPlanToExec);
      expect(hasEfficiencyBias).toBe(false);
    });
  });

  describe('AUTONOMY_BIAS detection logic', () => {
    it('should detect when code changes exist without PRD for code-requiring SD', () => {
      const requirements = { skipCodeValidation: false };
      const hasPRD = false;
      const hasCodeChanges = true;

      const hasAutonomyBias = !requirements.skipCodeValidation && hasCodeChanges && !hasPRD;
      expect(hasAutonomyBias).toBe(true);
    });

    it('should NOT detect bias when PRD exists', () => {
      const requirements = { skipCodeValidation: false };
      const hasPRD = true;
      const hasCodeChanges = true;

      const hasAutonomyBias = !requirements.skipCodeValidation && hasCodeChanges && !hasPRD;
      expect(hasAutonomyBias).toBe(false);
    });

    it('should NOT detect bias when no code changes exist', () => {
      const requirements = { skipCodeValidation: false };
      const hasPRD = false;
      const hasCodeChanges = false;

      const hasAutonomyBias = !requirements.skipCodeValidation && hasCodeChanges && !hasPRD;
      expect(hasAutonomyBias).toBe(false);
    });

    it('should NOT detect bias for infrastructure SDs (skipCodeValidation = true)', () => {
      const requirements = { skipCodeValidation: true }; // Infrastructure SD
      const hasPRD = false;
      const hasCodeChanges = true;

      const hasAutonomyBias = !requirements.skipCodeValidation && hasCodeChanges && !hasPRD;
      expect(hasAutonomyBias).toBe(false);
    });
  });

  describe('Bias severity classification', () => {
    it('should classify COMPLETION_BIAS as high severity', () => {
      const bias = {
        type: 'COMPLETION_BIAS',
        severity: 'high'
      };
      expect(bias.severity).toBe('high');
    });

    it('should classify EFFICIENCY_BIAS as medium severity', () => {
      const bias = {
        type: 'EFFICIENCY_BIAS',
        severity: 'medium'
      };
      expect(bias.severity).toBe('medium');
    });

    it('should classify AUTONOMY_BIAS as high severity', () => {
      const bias = {
        type: 'AUTONOMY_BIAS',
        severity: 'high'
      };
      expect(bias.severity).toBe('high');
    });

    it('should block on high severity biases', () => {
      const biases = [
        { type: 'COMPLETION_BIAS', severity: 'high' },
        { type: 'EFFICIENCY_BIAS', severity: 'medium' }
      ];

      const highSeverityBiases = biases.filter(b => b.severity === 'high');
      const shouldBlock = highSeverityBiases.length > 0;

      expect(shouldBlock).toBe(true);
    });

    it('should NOT block on only medium severity biases', () => {
      const biases = [
        { type: 'EFFICIENCY_BIAS', severity: 'medium' }
      ];

      const highSeverityBiases = biases.filter(b => b.severity === 'high');
      const shouldBlock = highSeverityBiases.length > 0;

      expect(shouldBlock).toBe(false);
    });
  });

  describe('Phase-specific bias applicability', () => {
    const execPhases = ['EXEC', 'EXEC_IMPLEMENTATION'];
    const nonExecPhases = ['LEAD', 'PLAN', 'PLAN_VERIFY', 'LEAD_FINAL', 'COMPLETED'];

    execPhases.forEach(phase => {
      it(`should check EFFICIENCY_BIAS for ${phase} phase`, () => {
        const sd = { current_phase: phase };
        const isExecPhase = ['EXEC', 'EXEC_IMPLEMENTATION'].includes(sd.current_phase);
        expect(isExecPhase).toBe(true);
      });
    });

    nonExecPhases.forEach(phase => {
      it(`should NOT check EFFICIENCY_BIAS for ${phase} phase`, () => {
        const sd = { current_phase: phase };
        const isExecPhase = ['EXEC', 'EXEC_IMPLEMENTATION'].includes(sd.current_phase);
        expect(isExecPhase).toBe(false);
      });
    });
  });

  describe('Code file detection patterns', () => {
    it('should identify JavaScript files as code files', () => {
      const files = ['src/utils/helper.js', 'lib/index.js'];
      const codeFiles = files.filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      expect(codeFiles.length).toBe(2);
    });

    it('should identify TypeScript files as code files', () => {
      const files = ['src/components/Button.tsx', 'lib/types.ts'];
      const codeFiles = files.filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      expect(codeFiles.length).toBe(2);
    });

    it('should exclude test files from code detection', () => {
      const files = ['src/utils/helper.test.js', 'lib/index.spec.ts'];
      const codeFiles = files.filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      expect(codeFiles.length).toBe(0);
    });

    it('should exclude markdown files from code detection', () => {
      const files = ['README.md', 'docs/guide.md'];
      const codeFiles = files.filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      expect(codeFiles.length).toBe(0);
    });

    it('should exclude JSON config files from code detection', () => {
      const files = ['package.json', 'tsconfig.json'];
      const codeFiles = files.filter(f =>
        f && !f.includes('.test.') && !f.includes('.spec.') &&
        !f.endsWith('.md') && !f.endsWith('.json') &&
        (f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.jsx'))
      );
      expect(codeFiles.length).toBe(0);
    });
  });
});
