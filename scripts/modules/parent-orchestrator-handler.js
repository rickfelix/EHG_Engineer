#!/usr/bin/env node

/**
 * ParentOrchestratorHandler - Intelligent handling for parent Strategic Directives
 *
 * SYSTEMIC FIX: Parent orchestrator SDs require different workflow handling than
 * implementation SDs. This module provides:
 *
 * 1. Parent SD Detection - Identifies if SD is a parent orchestrator
 * 2. PRD Auto-Generation - Creates decomposition-focused PRDs (not implementation-focused)
 * 3. Child Validation - Verifies children exist and are properly structured
 * 4. Workflow Guidance - Provides correct next steps for parent vs child SDs
 *
 * ROOT CAUSE: SD-VISION-V2-000 showed that parent SDs were being treated identically
 * to implementation SDs, leading to inappropriate PRD templates and workflow confusion.
 *
 * Usage:
 *   import { ParentOrchestratorHandler } from './modules/parent-orchestrator-handler.js';
 *   const handler = new ParentOrchestratorHandler(supabase);
 *   const result = await handler.handleParentSD(sdId);
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export class ParentOrchestratorHandler {
  constructor(supabase) {
    if (!supabase) {
      throw new Error('ParentOrchestratorHandler requires a Supabase client');
    }
    this.supabase = supabase;
  }

  /**
   * Check if an SD is a parent orchestrator
   * @param {object|string} sdOrId - SD object or ID
   * @returns {Promise<object>} { isParent, sd, children }
   */
  async isParentOrchestrator(sdOrId) {
    let sd = sdOrId;

    if (typeof sdOrId === 'string') {
      const { data } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .or(`id.eq.${sdOrId},legacy_id.eq.${sdOrId}`)
        .single();
      sd = data;
    }

    if (!sd) {
      return { isParent: false, sd: null, children: [] };
    }

    // Check metadata.is_parent flag
    const isParent = sd.metadata?.is_parent === true;

    if (!isParent) {
      return { isParent: false, sd, children: [] };
    }

    // Get children
    const { data: children } = await this.supabase
      .from('strategic_directives_v2')
      .select('id, legacy_id, title, status, current_phase, progress_percentage, priority')
      .eq('parent_sd_id', sd.id)
      .order('legacy_id', { ascending: true });

    return {
      isParent: true,
      sd,
      children: children || [],
      childrenCount: children?.length || 0,
      completedCount: (children || []).filter(c => c.status === 'completed').length
    };
  }

  /**
   * Generate a PRD appropriate for a parent orchestrator SD
   * Parent PRDs focus on:
   * - Overall migration/initiative scope
   * - Child SD decomposition structure
   * - Success criteria based on children completion
   * - Inter-child dependencies
   *
   * @param {string} sdId - Strategic Directive ID
   * @returns {Promise<object>} Created PRD
   */
  async generateParentPRD(sdId) {
    console.log('\n📋 PARENT ORCHESTRATOR PRD GENERATION');
    console.log('='.repeat(60));

    const { isParent, sd, children } = await this.isParentOrchestrator(sdId);

    if (!isParent) {
      throw new Error(`SD ${sdId} is not a parent orchestrator. Use standard PRD generation.`);
    }

    console.log(`   Parent SD: ${sd.legacy_id || sd.id}`);
    console.log(`   Title: ${sd.title}`);
    console.log(`   Children: ${children.length}`);

    // Check if PRD already exists
    const { data: existingPRD } = await this.supabase
      .from('product_requirements_v2')
      .select('id')
      .or(`sd_id.eq.${sd.id},directive_id.eq.${sd.legacy_id || sd.id}`)
      .maybeSingle();

    if (existingPRD) {
      console.log('   ℹ️  PRD already exists:', existingPRD.id);
      return { existing: true, prdId: existingPRD.id };
    }

    // Build decomposition structure from children
    const decompositionStructure = children.map((child, idx) => ({
      sequence: idx + 1,
      sd_id: child.legacy_id || child.id,
      title: child.title,
      status: child.status,
      priority: child.priority,
      dependencies: idx > 0 ? [children[idx - 1].legacy_id || children[idx - 1].id] : []
    }));

    // Build PRD for parent orchestrator
    const prdId = `PRD-${sd.legacy_id || sd.id.substring(0, 8)}`;

    const prdData = {
      id: prdId,
      sd_id: sd.id,
      directive_id: sd.legacy_id || sd.id,
      title: `${sd.title} - Orchestrator PRD`,
      version: '1.0',
      status: 'planning',
      category: sd.category || 'infrastructure',
      priority: sd.priority || 'high',

      executive_summary: this._buildParentExecutiveSummary(sd, children),
      business_context: this._buildParentBusinessContext(sd),

      // Parent-specific: Focus on decomposition, not implementation
      // Note: Need minimum 3 FRs to pass database constraint
      functional_requirements: [
        {
          id: 'FR-ORCHESTRATE-001',
          title: 'Child SD Orchestration',
          description: `Coordinate execution of ${children.length} child SDs in proper sequence`,
          priority: 'critical',
          acceptance_criteria: [
            `All ${children.length} child SDs complete successfully`,
            'Dependencies between children are respected',
            'Parent auto-completes when all children finish'
          ]
        },
        {
          id: 'FR-DECOMPOSE-001',
          title: 'Work Decomposition Structure',
          description: 'Maintain proper parent-child hierarchy with clear scope boundaries per child',
          priority: 'high',
          acceptance_criteria: [
            'Each child SD has distinct, non-overlapping scope',
            'Parent-child relationships recorded in database',
            'Child sequence reflects dependency order'
          ]
        },
        {
          id: 'FR-PROGRESS-001',
          title: 'Progress Tracking',
          description: 'Track overall initiative progress based on child SD completion',
          priority: 'high',
          acceptance_criteria: [
            'Parent progress reflects aggregate of children',
            'Status transitions tracked through handoffs',
            'Completion visible in dashboard'
          ]
        }
      ],

      technical_requirements: [
        {
          id: 'TR-DECOMPOSE-001',
          title: 'Child SD Structure',
          description: 'Maintain proper parent-child relationship in database',
          implementation_notes: 'Children linked via parent_sd_id foreign key'
        }
      ],

      // Store decomposition in metadata
      metadata: {
        prd_type: 'parent_orchestrator',
        is_orchestrator_prd: true,
        decomposition_structure: decompositionStructure,
        total_children: children.length,
        generation_method: 'ParentOrchestratorHandler.generateParentPRD',
        vision_spec_references: sd.metadata?.vision_spec_references || {},
        must_read_before_exec: sd.metadata?.readiness?.must_read_before_exec || []
      },

      // Simplified acceptance criteria for orchestrator
      acceptance_criteria: [
        `[ ] All ${children.length} child SDs have status = 'completed'`,
        '[ ] No child SD blocked or failed',
        '[ ] Parent progress_percentage = 100%',
        '[ ] All inter-child dependencies resolved'
      ],

      // Assumptions - what's out of scope for parent
      assumptions: [
        'Direct code implementation is delegated to child SDs',
        'Detailed technical design exists in each child PRD',
        'Unit/E2E tests are handled by child SDs',
        'Timeline is determined by child SD completion sequence'
      ],

      // Constraints for orchestrator
      constraints: [
        `Must complete all ${children.length} child SDs`,
        'Children must be executed in dependency order',
        'Parent cannot be finalized until all children complete'
      ],

      // Test scenarios for orchestrator (required by schema)
      test_scenarios: [
        {
          id: 'TS-ORCH-001',
          name: 'Child Completion Tracking',
          description: 'Verify parent tracks child SD completion correctly',
          steps: [
            'Check child SD status transitions',
            'Verify parent progress updates accordingly',
            'Confirm parent auto-completes when all children done'
          ],
          expected_result: 'Parent completes when all children complete'
        },
        {
          id: 'TS-ORCH-002',
          name: 'Dependency Enforcement',
          description: 'Verify children are executed in proper sequence',
          steps: [
            'Check child dependency chain',
            'Verify blocking when dependencies incomplete',
            'Confirm sequence is respected'
          ],
          expected_result: 'Children execute in dependency order'
        }
      ],

      // Dependencies - list child SDs
      dependencies: children.map(c => ({
        type: 'child_sd',
        id: c.legacy_id || c.id,
        title: c.title,
        status: c.status
      })),

      created_by: 'ParentOrchestratorHandler'
    };

    // Insert PRD
    const { data: newPRD, error } = await this.supabase
      .from('product_requirements_v2')
      .insert(prdData)
      .select()
      .single();

    if (error) {
      console.error('   ❌ Failed to create PRD:', error.message);
      throw error;
    }

    console.log('   ✅ Parent Orchestrator PRD created:', prdId);
    console.log('   📊 Decomposition structure stored in metadata');

    return {
      existing: false,
      prdId: newPRD.id,
      prd: newPRD,
      decomposition: decompositionStructure
    };
  }

  /**
   * Build executive summary for parent orchestrator
   */
  _buildParentExecutiveSummary(sd, children) {
    const completedCount = children.filter(c => c.status === 'completed').length;

    return `
## Parent Orchestrator Summary

**Initiative**: ${sd.title}

**Type**: Parent Orchestrator SD (coordinates ${children.length} child SDs)

**Current Progress**: ${completedCount}/${children.length} children completed

### Child SD Breakdown:
${children.map((c, i) => `${i + 1}. **${c.legacy_id || c.id}**: ${c.title} [${c.status}]`).join('\n')}

### Orchestration Model:
This parent SD does NOT contain implementation code. All implementation is delegated to child SDs. The parent:
- Tracks overall progress
- Ensures proper sequencing
- Auto-completes when all children finish

${sd.description || ''}
    `.trim();
  }

  /**
   * Build business context for parent orchestrator
   */
  _buildParentBusinessContext(sd) {
    return `
## Business Context

${sd.metadata?.references?.supporting?.[0]?.why || 'Strategic initiative requiring decomposition into multiple SDs.'}

### Strategic Objectives:
${(sd.strategic_objectives || []).map(obj => `- ${obj.objective}`).join('\n') || '- See child SDs for detailed objectives'}

### Governance:
- Parent-child SD pattern enforces structured execution
- Each child must pass LEAD approval before work begins
- Parent auto-completes when last child finishes
    `.trim();
  }

  /**
   * Validate children structure for a parent SD
   * @param {string} parentSdId - Parent SD ID
   * @returns {Promise<object>} Validation result
   */
  async validateChildrenStructure(parentSdId) {
    console.log('\n🔍 CHILD STRUCTURE VALIDATION');
    console.log('='.repeat(60));

    const { isParent, sd, children } = await this.isParentOrchestrator(parentSdId);

    if (!isParent) {
      return { valid: false, error: 'Not a parent orchestrator SD' };
    }

    const issues = [];
    const warnings = [];

    // Check minimum children
    if (children.length === 0) {
      issues.push('No child SDs found - parent orchestrator must have children');
    }

    // Validate each child
    for (const child of children) {
      // Check parent_sd_id is set correctly
      if (!child.legacy_id && !child.id) {
        issues.push('Child missing ID');
      }

      // Check child has required fields
      const { data: fullChild } = await this.supabase
        .from('strategic_directives_v2')
        .select('title, description, scope, strategic_objectives')
        .eq('id', child.id)
        .single();

      if (!fullChild?.description || fullChild.description.length < 50) {
        warnings.push(`${child.legacy_id || child.id}: Description too short or missing`);
      }

      if (!fullChild?.strategic_objectives || fullChild.strategic_objectives.length === 0) {
        warnings.push(`${child.legacy_id || child.id}: Missing strategic objectives`);
      }
    }

    // Check for sequence/dependency issues
    const completedChildren = children.filter(c => c.status === 'completed');
    const draftChildren = children.filter(c => c.status === 'draft');

    if (completedChildren.length > 0 && sd.status === 'draft') {
      warnings.push('Children have progressed but parent is still in draft - workflow inconsistency');
    }

    const valid = issues.length === 0;

    console.log(`   Parent: ${sd.legacy_id || sd.id}`);
    console.log(`   Children: ${children.length}`);
    console.log(`   Completed: ${completedChildren.length}`);
    console.log(`   Valid: ${valid ? '✅' : '❌'}`);

    if (issues.length > 0) {
      console.log('\n   ❌ Issues:');
      issues.forEach(i => console.log(`      - ${i}`));
    }

    if (warnings.length > 0) {
      console.log('\n   ⚠️  Warnings:');
      warnings.forEach(w => console.log(`      - ${w}`));
    }

    return {
      valid,
      issues,
      warnings,
      childrenCount: children.length,
      completedCount: completedChildren.length,
      draftCount: draftChildren.length
    };
  }

  /**
   * Get recommended next action for a parent SD
   * @param {string} sdId - SD ID
   * @returns {Promise<object>} Recommended action
   */
  async getNextAction(sdId) {
    const { isParent, sd, children, completedCount } = await this.isParentOrchestrator(sdId);

    if (!isParent) {
      return { action: 'NOT_PARENT', message: 'SD is not a parent orchestrator' };
    }

    // Check PRD exists
    const { data: prd } = await this.supabase
      .from('product_requirements_v2')
      .select('id')
      .or(`sd_id.eq.${sd.id},directive_id.eq.${sd.legacy_id || sd.id}`)
      .maybeSingle();

    // Check handoffs
    const { data: handoffs } = await this.supabase
      .from('sd_phase_handoffs')
      .select('handoff_type, status')
      .eq('sd_id', sd.id);

    const hasLeadToPlan = handoffs?.some(h => h.handoff_type === 'LEAD-TO-PLAN' && h.status === 'accepted');
    const hasPlanToExec = handoffs?.some(h => h.handoff_type === 'PLAN-TO-EXEC' && h.status === 'accepted');

    // Determine next action
    if (sd.status === 'draft' && !hasLeadToPlan) {
      return {
        action: 'LEAD_TO_PLAN',
        message: 'Run LEAD-TO-PLAN handoff for parent',
        command: `node scripts/handoff.js execute LEAD-TO-PLAN ${sd.legacy_id || sd.id}`
      };
    }

    if (!prd && hasLeadToPlan) {
      return {
        action: 'CREATE_PRD',
        message: 'Create parent orchestrator PRD',
        command: `node -e "import('./scripts/modules/parent-orchestrator-handler.js').then(m => new m.ParentOrchestratorHandler(supabase).generateParentPRD('${sd.legacy_id || sd.id}'))"`
      };
    }

    if (prd && !hasPlanToExec) {
      return {
        action: 'PLAN_TO_EXEC',
        message: 'Run PLAN-TO-EXEC to enter ORCHESTRATOR/WAITING state',
        command: `node scripts/handoff.js execute PLAN-TO-EXEC ${sd.legacy_id || sd.id}`
      };
    }

    if (hasPlanToExec && completedCount < children.length) {
      const nextChild = children.find(c => c.status === 'draft' || c.status === 'planning');
      if (nextChild) {
        return {
          action: 'WORK_ON_CHILD',
          message: `Work on next child SD: ${nextChild.legacy_id || nextChild.id}`,
          command: `node scripts/phase-preflight.js --phase LEAD --sd-id ${nextChild.legacy_id || nextChild.id}`,
          childId: nextChild.legacy_id || nextChild.id,
          childTitle: nextChild.title
        };
      }
    }

    if (completedCount === children.length && children.length > 0) {
      return {
        action: 'FINALIZE_PARENT',
        message: 'All children complete - finalize parent',
        command: `node scripts/handoff.js execute LEAD-FINAL-APPROVAL ${sd.legacy_id || sd.id}`
      };
    }

    return {
      action: 'UNKNOWN',
      message: 'Could not determine next action - check SD state manually',
      sd_status: sd.status,
      prd_exists: !!prd,
      handoffs: handoffs?.map(h => h.handoff_type) || []
    };
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Parent Orchestrator Handler
===========================

Usage:
  node scripts/modules/parent-orchestrator-handler.js check <SD_ID>
  node scripts/modules/parent-orchestrator-handler.js create-prd <SD_ID>
  node scripts/modules/parent-orchestrator-handler.js validate <SD_ID>
  node scripts/modules/parent-orchestrator-handler.js next <SD_ID>

Commands:
  check      - Check if SD is a parent orchestrator
  create-prd - Generate PRD for parent orchestrator
  validate   - Validate children structure
  next       - Get recommended next action
`);
    process.exit(0);
  }

  const command = args[0];
  const sdId = args[1];

  if (!sdId) {
    console.error('Error: SD ID required');
    process.exit(1);
  }

  // Initialize
  const dotenv = await import('dotenv');
  dotenv.config();

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const handler = new ParentOrchestratorHandler(supabase);

  try {
    switch (command) {
      case 'check': {
        const result = await handler.isParentOrchestrator(sdId);
        console.log('\nParent Orchestrator Check:');
        console.log(`  Is Parent: ${result.isParent ? 'YES' : 'NO'}`);
        if (result.isParent) {
          console.log(`  Children: ${result.childrenCount}`);
          console.log(`  Completed: ${result.completedCount}`);
        }
        break;
      }

      case 'create-prd': {
        const result = await handler.generateParentPRD(sdId);
        console.log('\nPRD Generation Result:');
        console.log(`  PRD ID: ${result.prdId}`);
        console.log(`  Existing: ${result.existing}`);
        break;
      }

      case 'validate': {
        const result = await handler.validateChildrenStructure(sdId);
        console.log('\nValidation Result:');
        console.log(`  Valid: ${result.valid}`);
        console.log(`  Children: ${result.childrenCount}`);
        console.log(`  Issues: ${result.issues.length}`);
        console.log(`  Warnings: ${result.warnings.length}`);
        break;
      }

      case 'next': {
        const result = await handler.getNextAction(sdId);
        console.log('\nNext Action:');
        console.log(`  Action: ${result.action}`);
        console.log(`  Message: ${result.message}`);
        if (result.command) {
          console.log(`  Command: ${result.command}`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (process.argv[1].includes('parent-orchestrator-handler')) {
  main();
}

export default ParentOrchestratorHandler;
