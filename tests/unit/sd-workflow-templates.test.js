/**
 * Tests for SD Workflow Templates - Type-Specific Progress Calculation
 * SD-LEO-INFRA-WORKFLOW-TEMPLATES-TYPE-001
 *
 * Verifies:
 * - Template existence for all registered SD types
 * - Weight sum validation (100.00 ±0.01)
 * - Template-based vs fallback progress calculation
 * - Orchestrator partial credit for children
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

describe('SD Workflow Templates', () => {
  let templates;

  beforeAll(async () => {
    const { data, error } = await supabase
      .from('sd_workflow_templates')
      .select('*, sd_workflow_template_steps(*)')
      .eq('is_active', true)
      .order('sd_type');

    expect(error).toBeNull();
    templates = data;
  });

  describe('Template Coverage', () => {
    const requiredTypes = [
      'feature', 'bugfix', 'enhancement', 'refactor',
      'performance', 'security', 'infrastructure',
      'documentation', 'docs', 'process', 'orchestrator', 'uat'
    ];

    it('should have active templates for all 12 registered SD types', () => {
      const templateTypes = templates.map(t => t.sd_type);
      for (const type of requiredTypes) {
        expect(templateTypes).toContain(type);
      }
    });

    it('should have exactly one active template per SD type', () => {
      const typeCounts = {};
      for (const t of templates) {
        typeCounts[t.sd_type] = (typeCounts[t.sd_type] || 0) + 1;
      }
      for (const type of requiredTypes) {
        expect(typeCounts[type]).toBe(1);
      }
    });
  });

  describe('Weight Validation', () => {
    it('should have weight sums of 100.00 (±0.01) for all templates', () => {
      for (const tmpl of templates) {
        const steps = tmpl.sd_workflow_template_steps || [];
        const weightSum = steps.reduce((sum, s) => sum + parseFloat(s.weight), 0);
        expect(Math.abs(weightSum - 100.00)).toBeLessThanOrEqual(0.01);
      }
    });

    it('should have no steps with weight > 100 or < 0', () => {
      for (const tmpl of templates) {
        for (const step of tmpl.sd_workflow_template_steps || []) {
          expect(parseFloat(step.weight)).toBeGreaterThanOrEqual(0);
          expect(parseFloat(step.weight)).toBeLessThanOrEqual(100);
        }
      }
    });
  });

  describe('Standard SD Templates', () => {
    const standardTypes = [
      'feature', 'bugfix', 'enhancement', 'refactor',
      'performance', 'security', 'infrastructure',
      'documentation', 'docs', 'process', 'uat'
    ];

    it('should have 6 steps for standard SD types', () => {
      for (const type of standardTypes) {
        const tmpl = templates.find(t => t.sd_type === type);
        expect(tmpl).toBeDefined();
        expect(tmpl.sd_workflow_template_steps.length).toBe(6);
      }
    });

    it('should have matching step keys for standard types', () => {
      const expectedKeys = [
        'LEAD_approval', 'PLAN_verification', 'EXEC_implementation',
        'LEAD_review', 'RETROSPECTIVE', 'LEAD_final_approval'
      ];
      for (const type of standardTypes) {
        const tmpl = templates.find(t => t.sd_type === type);
        const stepKeys = tmpl.sd_workflow_template_steps
          .sort((a, b) => a.step_order - b.step_order)
          .map(s => s.step_key);
        expect(stepKeys).toEqual(expectedKeys);
      }
    });

    it('should have correct weights matching hardcoded logic (10/10/50/10/10/10)', () => {
      const expectedWeights = { LEAD_approval: 10, PLAN_verification: 10, EXEC_implementation: 50, LEAD_review: 10, RETROSPECTIVE: 10, LEAD_final_approval: 10 };
      for (const type of standardTypes) {
        const tmpl = templates.find(t => t.sd_type === type);
        for (const step of tmpl.sd_workflow_template_steps) {
          expect(parseFloat(step.weight)).toBeCloseTo(expectedWeights[step.step_key], 1);
        }
      }
    });
  });

  describe('Orchestrator Template', () => {
    it('should have 4 steps for orchestrator type', () => {
      const tmpl = templates.find(t => t.sd_type === 'orchestrator');
      expect(tmpl).toBeDefined();
      expect(tmpl.sd_workflow_template_steps.length).toBe(4);
    });

    it('should have correct orchestrator step keys', () => {
      const tmpl = templates.find(t => t.sd_type === 'orchestrator');
      const stepKeys = tmpl.sd_workflow_template_steps
        .sort((a, b) => a.step_order - b.step_order)
        .map(s => s.step_key);
      expect(stepKeys).toEqual([
        'LEAD_initial', 'FINAL_handoff', 'RETROSPECTIVE', 'CHILDREN_completion'
      ]);
    });

    it('should have correct orchestrator weights (20/5/15/60)', () => {
      const expectedWeights = { LEAD_initial: 20, FINAL_handoff: 5, RETROSPECTIVE: 15, CHILDREN_completion: 60 };
      const tmpl = templates.find(t => t.sd_type === 'orchestrator');
      for (const step of tmpl.sd_workflow_template_steps) {
        expect(parseFloat(step.weight)).toBeCloseTo(expectedWeights[step.step_key], 1);
      }
    });
  });

  describe('Completion Signals', () => {
    it('should have valid completion signals for all steps', () => {
      const validSignals = [
        'handoff:LEAD-TO-PLAN', 'handoff:PLAN-TO-EXEC', 'handoff:EXEC-TO-PLAN',
        'handoff:PLAN-TO-LEAD', 'handoff:LEAD-FINAL-APPROVAL',
        'artifact:retrospective',
        'handoff:PLAN-TO-LEAD|handoff:PLAN-TO-EXEC',
        'children:all_complete'
      ];
      for (const tmpl of templates) {
        for (const step of tmpl.sd_workflow_template_steps || []) {
          expect(validSignals).toContain(step.completion_signal);
        }
      }
    });
  });

  describe('Validation Function', () => {
    it('should return no violations for valid templates', async () => {
      for (const tmpl of templates) {
        const { data, error } = await supabase.rpc('validate_sd_workflow_template', { p_template_id: tmpl.id });
        expect(error).toBeNull();
        expect(data).toEqual([]);
      }
    });
  });

  describe('Progress Calculation', () => {
    it('should include source field indicating template usage', async () => {
      // Find an SD with a template-covered type
      const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id, sd_type')
        .eq('sd_type', 'infrastructure')
        .limit(1);

      if (sds && sds.length > 0) {
        const { data: progress } = await supabase.rpc('get_progress_breakdown', {
          sd_id_param: sds[0].id
        });
        expect(progress).toBeDefined();
        expect(progress.phase_breakdown).toBeDefined();

        // Check that at least one step has source='template'
        const phases = progress.phase_breakdown;
        const sources = Object.values(phases).map(p => p.source);
        expect(sources).toContain('template');
      }
    });

    it('should return template_id when using template-based calculation', async () => {
      const { data: sds } = await supabase
        .from('strategic_directives_v2')
        .select('id')
        .eq('sd_type', 'feature')
        .limit(1);

      if (sds && sds.length > 0) {
        const { data: progress } = await supabase.rpc('get_progress_breakdown', {
          sd_id_param: sds[0].id
        });
        expect(progress.template_id).toBeDefined();
        expect(progress.template_version).toBeDefined();
      }
    });
  });

  describe('Admin View', () => {
    it('should return all active templates via view', async () => {
      const { data, error } = await supabase
        .from('v_active_sd_workflow_templates')
        .select('*');

      expect(error).toBeNull();
      expect(data.length).toBeGreaterThanOrEqual(12);

      for (const row of data) {
        expect(Math.abs(parseFloat(row.weight_sum) - 100.00)).toBeLessThanOrEqual(0.01);
        expect(row.step_count).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
