/**
 * Integration Tests: Handoff Retrospective System
 * Tests retrospective creation, extraction triggers, and pre-handoff warnings
 *
 * Test Coverage:
 * - LEAD_TO_PLAN handoff creates retrospective with correct type
 * - PLAN_TO_EXEC handoff creates retrospective with correct type
 * - Pre-handoff warnings displayed when relevant
 * - Retrospective extraction trigger fires correctly
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();


















dotenv.config();

// Test fixtures
const fixturesPath = join(process.cwd(), 'tests', 'fixtures', 'protocol-improvements');
const sampleRetrospective = JSON.parse(
  readFileSync(join(fixturesPath, 'sample-retrospective.json'), 'utf-8')
);

/**
 * MOCK: HandoffSystem with retrospective integration
 *
 * Simulates the handoff system from scripts/modules/handoff/
 */
class HandoffSystemWithRetrospective {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Execute LEAD-TO-PLAN handoff and create retrospective
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<object>} - Handoff result
   */
  async executeLeadToPlan(sdId) {
    // Simulate handoff validation
    const validationResult = await this._validateLeadToPlan(sdId);

    if (!validationResult.success) {
      return {
        success: false,
        ...validationResult
      };
    }

    // Record handoff execution
    const executionId = await this._recordHandoffExecution('LEAD-TO-PLAN', sdId);

    // Create retrospective for LEAD phase
    const retrospective = await this.createRetrospective(sdId, 'LEAD-TO-PLAN', {
      learning_category: 'STRATEGIC_ALIGNMENT',
      what_went_well: validationResult.strengths || [],
      what_went_wrong: validationResult.issues || [],
      lessons_learned: validationResult.lessons || []
    });

    return {
      success: true,
      executionId,
      retrospectiveId: retrospective.id,
      retrospectiveType: retrospective.learning_category
    };
  }

  /**
   * Execute PLAN-TO-EXEC handoff and create retrospective
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<object>} - Handoff result
   */
  async executePlanToExec(sdId) {
    // Simulate handoff validation
    const validationResult = await this._validatePlanToExec(sdId);

    if (!validationResult.success) {
      return {
        success: false,
        ...validationResult
      };
    }

    // Record handoff execution
    const executionId = await this._recordHandoffExecution('PLAN-TO-EXEC', sdId);

    // Create retrospective for PLAN phase
    const retrospective = await this.createRetrospective(sdId, 'PLAN-TO-EXEC', {
      learning_category: 'REQUIREMENTS_QUALITY',
      what_went_well: validationResult.strengths || [],
      what_went_wrong: validationResult.issues || [],
      lessons_learned: validationResult.lessons || [],
      protocol_improvements: validationResult.protocol_improvements || []
    });

    return {
      success: true,
      executionId,
      retrospectiveId: retrospective.id,
      retrospectiveType: retrospective.learning_category
    };
  }

  /**
   * Get pre-handoff warnings for SD
   * @param {string} sdId - Strategic Directive ID
   * @param {string} handoffType - LEAD-TO-PLAN or PLAN-TO-EXEC
   * @returns {Promise<Array>} - Array of warning objects
   */
  async getPreHandoffWarnings(sdId, handoffType) {
    const warnings = [];

    // Check for recent retrospectives with unresolved issues
    const { data: recentRetros } = await this.supabase
      .from('retrospectives')
      .select('*')
      .eq('sd_id', sdId)
      .order('conducted_date', { ascending: false })
      .limit(3);

    if (recentRetros && recentRetros.length > 0) {
      recentRetros.forEach(retro => {
        // Warn about unresolved protocol improvements
        if (retro.protocol_improvements && retro.protocol_improvements.length > 0) {
          const unresolved = retro.protocol_improvements.filter(
            pi => !pi.status || pi.status === 'pending'
          );

          if (unresolved.length > 0) {
            warnings.push({
              type: 'UNRESOLVED_IMPROVEMENTS',
              severity: 'medium',
              message: `${unresolved.length} protocol improvements from previous retrospective not yet addressed`,
              retrospectiveId: retro.id
            });
          }
        }

        // Warn about recurring failure patterns
        if (retro.failure_patterns && retro.failure_patterns.length > 0) {
          retro.failure_patterns.forEach(pattern => {
            if (pattern.occurrence_count > 2) {
              warnings.push({
                type: 'RECURRING_PATTERN',
                severity: 'high',
                message: `Recurring pattern detected: ${pattern.pattern_id} (${pattern.occurrence_count} occurrences)`,
                patternId: pattern.pattern_id
              });
            }
          });
        }
      });
    }

    return warnings;
  }

  /**
   * Create retrospective record
   * @param {string} sdId - Strategic Directive ID
   * @param {string} handoffType - Handoff type
   * @param {object} data - Retrospective data
   * @returns {Promise<object>} - Created retrospective
   */
  async createRetrospective(sdId, handoffType, data) {
    const retrospective = {
      id: `retro-${sdId}-${Date.now()}`,
      sd_id: sdId,
      title: `Retrospective: ${handoffType} for ${sdId}`,
      conducted_date: new Date().toISOString(),
      learning_category: data.learning_category || 'GENERAL',
      what_went_well: data.what_went_well || [],
      what_went_wrong: data.what_went_wrong || [],
      lessons_learned: data.lessons_learned || [],
      action_items: data.action_items || '',
      protocol_improvements: data.protocol_improvements || [],
      failure_patterns: data.failure_patterns || [],
      quality_score: this._calculateQualityScore(data),
      created_by: 'HANDOFF-SYSTEM'
    };

    const { data: created, error } = await this.supabase
      .from('retrospectives')
      .insert(retrospective)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create retrospective: ${error.message}`);
    }

    return created;
  }

  // Helper methods
  async _validateLeadToPlan(sdId) {
    // Simplified validation
    const { data: sd } = await this.supabase
      .from('strategic_directives_v2')
      .select('*')
      .eq('id', sdId)
      .single();

    if (!sd) {
      return {
        success: false,
        message: 'Strategic Directive not found'
      };
    }

    return {
      success: true,
      strengths: ['SD approved by LEAD'],
      issues: [],
      lessons: ['Approval criteria clear']
    };
  }

  async _validatePlanToExec(sdId) {
    // Simplified validation with protocol improvements
    const { data: prd } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('sd_id', sdId)
      .single();

    const issues = [];
    const improvements = [];

    if (!prd) {
      return {
        success: false,
        message: 'PRD not found'
      };
    }

    // Check for missing fields (simulated issue)
    if (!prd.functional_requirements || prd.functional_requirements.length === 0) {
      issues.push('PRD missing functional_requirements');
      improvements.push({
        category: 'VALIDATION',
        improvement: 'Add pre-flight PRD validation for functional_requirements',
        evidence: 'Missing functional_requirements caused handoff delay',
        impact: 'Would prevent similar issues in future handoffs',
        affected_phase: 'PLAN'
      });
    }

    return {
      success: issues.length === 0,
      strengths: ['PRD structure validated'],
      issues,
      lessons: ['PRD validation needs improvement'],
      protocol_improvements: improvements
    };
  }

  async _recordHandoffExecution(handoffType, sdId) {
    const execution = {
      id: `exec-${Date.now()}`,
      handoff_type: handoffType,
      sd_id: sdId,
      status: 'accepted',
      validation_score: 85,
      initiated_at: new Date().toISOString(),
      accepted_at: new Date().toISOString()
    };

    await this.supabase
      .from('leo_handoff_executions')
      .insert(execution);

    return execution.id;
  }

  _calculateQualityScore(data) {
    let score = 100;

    // Deduct for missing protocol improvements if PROCESS_IMPROVEMENT category
    if (data.learning_category === 'PROCESS_IMPROVEMENT') {
      if (!data.protocol_improvements || data.protocol_improvements.length === 0) {
        score -= 10;
      }
    }

    return score;
  }
}

/**
 * MOCK: RetrospectiveExtractionTrigger
 *
 * Simulates database trigger that extracts protocol improvements
 */
class RetrospectiveExtractionTrigger {
  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Simulate trigger execution on retrospective insert/update
   * @param {object} retrospective - Retrospective record
   * @returns {Promise<object>} - Extraction result
   */
  async onRetrospectiveChange(retrospective) {
    const improvements = [];

    // Extract from protocol_improvements field
    if (retrospective.protocol_improvements &&
        Array.isArray(retrospective.protocol_improvements)) {
      retrospective.protocol_improvements.forEach(pi => {
        improvements.push({
          source_retrospective_id: retrospective.id,
          category: pi.category,
          improvement_text: pi.improvement,
          evidence: pi.evidence,
          impact_assessment: this._assessImpact(pi.impact),
          affected_phase: pi.affected_phase,
          target_table: pi.target_table || 'unknown',
          status: 'pending_review',
          created_at: new Date().toISOString()
        });
      });
    }

    // Insert into improvement queue
    if (improvements.length > 0) {
      const { error } = await this.supabase
        .from('protocol_improvement_queue')
        .insert(improvements);

      if (error) {
        console.error('Failed to insert improvements:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }

    return {
      success: true,
      extractedCount: improvements.length
    };
  }

  _assessImpact(impactString) {
    if (!impactString) return 'medium';
    if (impactString.toLowerCase().includes('prevent') ||
        impactString.toLowerCase().includes('80%')) {
      return 'high';
    }
    return 'medium';
  }
}

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Handoff Retrospective Integration', () => {
  let supabase;
  let handoffSystem;
  let extractionTrigger;
  const testSDId = 'SD-TEST-RETRO-' + Date.now();

  beforeAll(() => {
    // Skip if no database credentials
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL === 'your_supabase_url_here') {
      console.warn('Skipping integration tests - no Supabase credentials');
      return;
    }

    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    handoffSystem = new HandoffSystemWithRetrospective(supabase);
    extractionTrigger = new RetrospectiveExtractionTrigger(supabase);
  });

  afterAll(async () => {
    if (!supabase) return;

    // Cleanup test data
    await supabase.from('retrospectives').delete().like('sd_id', 'SD-TEST-RETRO-%');
    await supabase.from('protocol_improvement_queue').delete().like('source_retrospective_id', 'retro-SD-TEST-RETRO-%');
  });

  describe('LEAD-TO-PLAN Handoff', () => {
    test('should create retrospective with STRATEGIC_ALIGNMENT type', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      // Create test SD
      await supabase.from('strategic_directives_v2').insert({
        id: testSDId,
        title: 'Test SD for Retrospective',
        status: 'approved',
        created_by: 'TEST'
      });

      const result = await handoffSystem.executeLeadToPlan(testSDId);

      expect(result.success).toBe(true);
      expect(result.retrospectiveId).toBeDefined();
      expect(result.retrospectiveType).toBe('STRATEGIC_ALIGNMENT');

      // Verify retrospective was created
      const { data: retro } = await supabase
        .from('retrospectives')
        .select('*')
        .eq('id', result.retrospectiveId)
        .single();

      expect(retro).toBeDefined();
      expect(retro.sd_id).toBe(testSDId);
      expect(retro.learning_category).toBe('STRATEGIC_ALIGNMENT');
    });
  });

  describe('PLAN-TO-EXEC Handoff', () => {
    test('should create retrospective with REQUIREMENTS_QUALITY type', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      const sdId = `${testSDId}-PLAN`;

      // Create test SD and PRD
      await supabase.from('strategic_directives_v2').insert({
        id: sdId,
        title: 'Test SD for PLAN handoff',
        status: 'approved',
        created_by: 'TEST'
      });

      await supabase.from('product_requirements_v2').insert({
        id: `PRD-${sdId}`,
        sd_id: sdId,
        title: 'Test PRD',
        functional_requirements: ['Requirement 1'],
        created_by: 'TEST'
      });

      const result = await handoffSystem.executePlanToExec(sdId);

      expect(result.success).toBe(true);
      expect(result.retrospectiveType).toBe('REQUIREMENTS_QUALITY');

      // Verify retrospective
      const { data: retro } = await supabase
        .from('retrospectives')
        .select('*')
        .eq('id', result.retrospectiveId)
        .single();

      expect(retro.learning_category).toBe('REQUIREMENTS_QUALITY');
    });

    test('should include protocol_improvements when validation issues found', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      const sdId = `${testSDId}-ISSUES`;

      // Create test SD with incomplete PRD (missing functional_requirements)
      await supabase.from('strategic_directives_v2').insert({
        id: sdId,
        title: 'Test SD with PRD issues',
        status: 'approved',
        created_by: 'TEST'
      });

      await supabase.from('product_requirements_v2').insert({
        id: `PRD-${sdId}`,
        sd_id: sdId,
        title: 'Incomplete PRD',
        functional_requirements: [], // Empty - should trigger improvement
        created_by: 'TEST'
      });

      const result = await handoffSystem.executePlanToExec(sdId);

      // May fail validation, but should still create retrospective
      const { data: retro } = await supabase
        .from('retrospectives')
        .select('*')
        .eq('sd_id', sdId)
        .order('conducted_date', { ascending: false })
        .limit(1)
        .single();

      expect(retro).toBeDefined();
      expect(retro.protocol_improvements).toBeDefined();
      expect(retro.protocol_improvements.length).toBeGreaterThan(0);

      const improvement = retro.protocol_improvements[0];
      expect(improvement.category).toBe('VALIDATION');
      expect(improvement.improvement).toContain('functional_requirements');
    });
  });

  describe('Pre-Handoff Warnings', () => {
    test('should display warnings for unresolved improvements', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      const sdId = `${testSDId}-WARNINGS`;

      // Create retrospective with unresolved improvements
      await supabase.from('retrospectives').insert({
        id: `retro-${sdId}`,
        sd_id: sdId,
        title: 'Previous retrospective with improvements',
        conducted_date: new Date().toISOString(),
        learning_category: 'PROCESS_IMPROVEMENT',
        what_went_well: ['Something good'],
        what_went_wrong: ['Something bad'],
        lessons_learned: ['A lesson'],
        protocol_improvements: [
          {
            category: 'VALIDATION',
            improvement: 'Add validation step',
            status: 'pending'
          },
          {
            category: 'DOCUMENTATION',
            improvement: 'Update docs',
            status: 'pending'
          }
        ],
        quality_score: 90,
        created_by: 'TEST'
      });

      const warnings = await handoffSystem.getPreHandoffWarnings(sdId, 'PLAN-TO-EXEC');

      expect(warnings.length).toBeGreaterThan(0);

      const improvementWarning = warnings.find(
        w => w.type === 'UNRESOLVED_IMPROVEMENTS'
      );

      expect(improvementWarning).toBeDefined();
      expect(improvementWarning.severity).toBe('medium');
      expect(improvementWarning.message).toContain('2 protocol improvements');
    });

    test('should warn about recurring failure patterns', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      const sdId = `${testSDId}-PATTERNS`;

      // Create retrospective with recurring pattern
      await supabase.from('retrospectives').insert({
        id: `retro-${sdId}`,
        sd_id: sdId,
        title: 'Retrospective with recurring pattern',
        conducted_date: new Date().toISOString(),
        learning_category: 'FAILURE_ANALYSIS',
        what_went_well: [],
        what_went_wrong: ['Pattern occurred again'],
        lessons_learned: ['Need to fix root cause'],
        failure_patterns: [
          {
            pattern_id: 'PAT-PRD-VALIDATION-001',
            occurrence_count: 5,
            impact: 'high',
            description: 'PRD validation failures'
          }
        ],
        quality_score: 70,
        created_by: 'TEST'
      });

      const warnings = await handoffSystem.getPreHandoffWarnings(sdId, 'PLAN-TO-EXEC');

      const patternWarning = warnings.find(
        w => w.type === 'RECURRING_PATTERN'
      );

      expect(patternWarning).toBeDefined();
      expect(patternWarning.severity).toBe('high');
      expect(patternWarning.message).toContain('PAT-PRD-VALIDATION-001');
      expect(patternWarning.message).toContain('5 occurrences');
    });
  });

  describe('Retrospective Extraction Trigger', () => {
    test('should extract improvements to queue when retrospective created', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      const retroId = `retro-trigger-test-${Date.now()}`;

      // Simulate retrospective creation
      const retrospective = {
        id: retroId,
        sd_id: testSDId,
        title: 'Test retrospective for trigger',
        conducted_date: new Date().toISOString(),
        learning_category: 'PROCESS_IMPROVEMENT',
        what_went_well: ['Tests passed'],
        what_went_wrong: ['Handoff took too long'],
        lessons_learned: ['Need better validation'],
        protocol_improvements: [
          {
            category: 'VALIDATION',
            improvement: 'Add pre-flight checks',
            evidence: 'Handoff failures reduced',
            impact: 'Would prevent 80% of failures',
            affected_phase: 'PLAN',
            target_table: 'leo_handoff_templates'
          }
        ],
        quality_score: 90,
        created_by: 'TEST'
      };

      // Simulate trigger execution
      const result = await extractionTrigger.onRetrospectiveChange(retrospective);

      expect(result.success).toBe(true);
      expect(result.extractedCount).toBe(1);

      // Verify improvement was added to queue
      const { data: queueItems } = await supabase
        .from('protocol_improvement_queue')
        .select('*')
        .eq('source_retrospective_id', retroId);

      expect(queueItems).toBeDefined();
      expect(queueItems.length).toBe(1);
      expect(queueItems[0].category).toBe('VALIDATION');
      expect(queueItems[0].improvement_text).toBe('Add pre-flight checks');
      expect(queueItems[0].target_table).toBe('leo_handoff_templates');
    });

    test('should handle retrospective with no improvements gracefully', async () => {
      if (!supabase) {
        console.warn('Skipping test - no database connection');
        return;
      }

      const retrospective = {
        id: `retro-empty-${Date.now()}`,
        sd_id: testSDId,
        title: 'Retrospective with no improvements',
        conducted_date: new Date().toISOString(),
        learning_category: 'GENERAL',
        what_went_well: ['Everything worked'],
        what_went_wrong: [],
        lessons_learned: [],
        protocol_improvements: [], // Empty
        quality_score: 100,
        created_by: 'TEST'
      };

      const result = await extractionTrigger.onRetrospectiveChange(retrospective);

      expect(result.success).toBe(true);
      expect(result.extractedCount).toBe(0);
    });
  });
});
