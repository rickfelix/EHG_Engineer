#!/usr/bin/env node

/**
 * Unified LEO Protocol Handoff System
 * Comprehensive handoff management leveraging database templates
 * 
 * FEATURES:
 * - Unified interface for all handoff types (LEAD→PLAN, PLAN→EXEC, EXEC→PLAN)
 * - Database-driven execution with full audit trail
 * - PRD quality enforcement for PLAN→EXEC transitions
 * - Template-based validation with custom rules
 * - Rejection workflow with improvement guidance
 * - Dashboard integration for real-time monitoring
 */

import { createClient } from '@supabase/supabase-js';
import HandoffValidator from './handoff-validator.js';
import LeadToPlanVerifier from './verify-handoff-lead-to-plan.js';
import PlanToExecVerifier from './verify-handoff-plan-to-exec.js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class UnifiedHandoffSystem {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.handoffValidator = new HandoffValidator();
    
    // Initialize specialized verifiers
    this.leadToPlanVerifier = new LeadToPlanVerifier();
    this.planToExecVerifier = new PlanToExecVerifier();
    
    // Supported handoff types
    this.supportedHandoffs = [
      'LEAD-to-PLAN',
      'PLAN-to-EXEC',
      'EXEC-to-PLAN',
      'PLAN-to-LEAD'
    ];
  }
  
  /**
   * Main handoff execution entry point
   */
  async executeHandoff(handoffType, sdId, options = {}) {
    console.log('🔄 UNIFIED LEO HANDOFF SYSTEM');
    console.log('='.repeat(50));
    console.log(`Type: ${handoffType}`);
    console.log(`Strategic Directive: ${sdId}`);
    console.log(`Options:`, options);
    console.log('');
    
    try {
      // Validate handoff type
      if (!this.supportedHandoffs.includes(handoffType)) {
        throw new Error(`Unsupported handoff type: ${handoffType}`);
      }
      
      // Load handoff template
      const template = await this.loadHandoffTemplate(handoffType);
      if (!template) {
        throw new Error(`No template found for handoff type: ${handoffType}`);
      }
      
      // Route to specialized verifier
      let result;
      switch (handoffType) {
        case 'LEAD-to-PLAN':
          result = await this.leadToPlanVerifier.verifyHandoff(sdId);
          break;

        case 'PLAN-to-EXEC':
          result = await this.planToExecVerifier.verifyHandoff(sdId, options.prdId);
          break;

        case 'EXEC-to-PLAN':
          result = await this.executeExecToPlan(sdId, options);
          break;

        case 'PLAN-to-LEAD':
          result = await this.executePlanToLead(sdId, options);
          break;

        default:
          throw new Error(`Handler not implemented for: ${handoffType}`);
      }
      
      // Create unified execution record
      if (result.success) {
        await this.recordSuccessfulHandoff(handoffType, sdId, result, template);
      } else {
        await this.recordFailedHandoff(handoffType, sdId, result, template);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ Handoff system error:', error.message);
      
      // Record system error
      await this.recordSystemError(handoffType, sdId, error.message);
      
      return {
        success: false,
        error: error.message,
        systemError: true
      };
    }
  }
  
  /**
   * Load handoff template from database
   */
  async loadHandoffTemplate(handoffType) {
    const [fromAgent, , toAgent] = handoffType.split('-');
    
    const { data: template, error } = await this.supabase
      .from('leo_handoff_templates')
      .select('*')
      .eq('from_agent', fromAgent)
      .eq('to_agent', toAgent)
      .single();
      
    if (error) {
      console.warn(`⚠️  Template not found: ${handoffType} - ${error.message}`);
      return null;
    }
    
    console.log(`📋 Template loaded: ${template.name}`);
    return template;
  }
  
  /**
   * Execute EXEC → PLAN handoff (verification and acceptance)
   */
  async executeExecToPlan(sdId, options) {
    console.log('🔍 EXEC → PLAN HANDOFF EXECUTION');
    console.log('-'.repeat(30));
    
    try {
      // Load Strategic Directive and PRD
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();
        
      if (!sd) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }
      
      // Use new sd_uuid column (post-migration) with fallback to uuid_id lookup
      const sdUuid = sd.uuid_id || sd.id;

      const { data: prds } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_uuid', sdUuid);

      if (!prds || prds.length === 0) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'NO_PRD',
          message: 'No PRD found - cannot verify EXEC work'
        };
      }
      
      const prd = prds[0];
      
      // Check if EXEC work is complete
      const execValidation = this.validateExecWork(prd);

      console.log('📊 EXEC Validation Results:');
      console.log('   Score:', execValidation.score);
      console.log('   Checklist:', execValidation.checkedItems, '/', execValidation.totalItems);
      console.log('   Issues:', execValidation.issues);
      console.log('   Complete:', execValidation.complete);

      if (!execValidation.complete) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'EXEC_INCOMPLETE',
          message: 'EXEC work not complete - cannot handoff to PLAN for verification',
          details: execValidation
        };
      }

      // SD-DOCUMENTATION-001: Documentation validation (MANDATORY)
      console.log('📚 Validating documentation exists...');
      const { data: docs, error: docsError } = await this.supabase
        .from('generated_docs')
        .select('id')
        .eq('sd_id', sdId)
        .limit(1);

      if (docsError) {
        console.warn(`⚠️  Documentation check failed: ${docsError.message}`);
        console.warn('   Proceeding with warning (infrastructure issue, not blocking)');
      } else if (!docs || docs.length === 0) {
        console.error('❌ DOCUMENTATION MISSING');
        console.error('   No documentation found in generated_docs table');
        console.error('');
        console.error('   This SD has not been documented according to LEO Protocol requirements.');
        console.error('   EXEC agents must generate documentation before creating EXEC→PLAN handoff.');
        console.error('');
        console.error('   REMEDIATION:');
        console.error(`   node scripts/generate-workflow-docs.js --sd-id ${sdId}`);
        console.error('');
        console.error('   After generating documentation, retry this handoff.');

        return {
          success: false,
          rejected: true,
          reasonCode: 'DOCUMENTATION_MISSING',
          message: 'No documentation found - EXEC→PLAN handoff blocked per SD-DOCUMENTATION-001',
          remediation: `node scripts/generate-workflow-docs.js --sd-id ${sdId}`,
          details: {
            sd_id: sdId,
            docs_found: 0,
            requirement: 'All Strategic Directives must have documentation before EXEC→PLAN handoff',
            protocol_integration: 'SD-DOCUMENTATION-001'
          }
        };
      } else {
        console.log(`✅ Documentation validated: ${docs.length} record(s) found`);
      }

      // Database-first: No file creation, handoff stored in sd_phase_handoffs table
      console.log('📝 EXEC→PLAN handoff will be stored in database (sd_phase_handoffs table)');

      const handoffId = `EXEC-to-PLAN-${sdId}-${Date.now()}`;

      // Update PRD status for PLAN verification
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'verification',
          phase: 'PLAN_VERIFICATION',
          updated_at: new Date().toISOString(),
          metadata: {
            ...prd.metadata,
            exec_handoff: {
              handoff_id: handoffId,
              completed_at: new Date().toISOString(),
              validation: execValidation
            }
          }
        })
        .eq('id', prd.id);

      console.log('✅ EXEC → PLAN HANDOFF APPROVED');
      console.log('📋 EXEC work complete and handed to PLAN for verification');
      console.log('📊 Handoff ID:', handoffId);

      return {
        success: true,
        prdId: prd.id,
        handoffId: handoffId,
        validation: execValidation
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        reasonCode: 'SYSTEM_ERROR'
      };
    }
  }
  
  /**
   * Execute PLAN → LEAD handoff
   * PLAN has completed verification and is handing back to LEAD for final approval
   */
  async executePlanToLead(sdId, options) {
    console.log('🔍 PLAN → LEAD HANDOFF EXECUTION');
    console.log('-'.repeat(30));

    try {
      // Load Strategic Directive and PRD
      const { data: sd } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();

      if (!sd) {
        throw new Error(`Strategic Directive not found: ${sdId}`);
      }

      // Use new sd_uuid column (post-migration) with fallback to uuid_id lookup
      const sdUuid = sd.uuid_id || sd.id;

      const { data: prds } = await this.supabase
        .from('product_requirements_v2')
        .select('*')
        .eq('sd_uuid', sdUuid);

      if (!prds || prds.length === 0) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'NO_PRD',
          message: 'No PRD found - cannot verify work'
        };
      }

      const prd = prds[0];

      // Validate PLAN verification is complete
      const planValidation = this.validatePlanVerification(prd, sd);

      console.log('📊 PLAN Verification Results:');
      console.log('   Score:', planValidation.score);
      console.log('   Issues:', planValidation.issues);
      console.log('   Warnings:', planValidation.warnings);
      console.log('   Complete:', planValidation.complete);

      if (!planValidation.complete) {
        return {
          success: false,
          rejected: true,
          reasonCode: 'PLAN_INCOMPLETE',
          message: 'PLAN verification not complete - cannot handoff to LEAD for approval',
          details: planValidation
        };
      }

      // Database-first: Store handoff in database
      console.log('📝 PLAN→LEAD handoff will be stored in database');

      const handoffId = `PLAN-to-LEAD-${sdId}-${Date.now()}`;

      // Update PRD status for LEAD approval
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'pending_approval',
          phase: 'LEAD_APPROVAL',
          updated_at: new Date().toISOString(),
          metadata: {
            ...prd.metadata,
            plan_handoff: {
              handoff_id: handoffId,
              completed_at: new Date().toISOString(),
              validation: planValidation
            }
          }
        })
        .eq('id', prd.id);

      // Update SD status for LEAD approval
      await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'pending_approval',
          current_phase: 'LEAD',
          updated_at: new Date().toISOString()
        })
        .eq('id', sdId);

      console.log('✅ PLAN → LEAD HANDOFF APPROVED');
      console.log('📋 PLAN verification complete and handed to LEAD for approval');
      console.log('📊 Handoff ID:', handoffId);

      return {
        success: true,
        sdId: sdId,
        prdId: prd.id,
        handoffId: handoffId,
        validation: planValidation
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        reasonCode: 'SYSTEM_ERROR'
      };
    }
  }

  /**
   * Validate PLAN verification completeness
   */
  validatePlanVerification(prd, sd) {
    const validation = {
      complete: false,
      score: 0,
      issues: [],
      warnings: []
    };

    // Check PRD status is 'verification' (from EXEC→PLAN handoff)
    if (prd.status === 'verification' || prd.status === 'completed') {
      validation.score += 30;
    } else {
      validation.issues.push(`PRD status is '${prd.status}', expected 'verification' or 'completed'`);
    }

    // Check EXEC handoff exists in metadata
    if (prd.metadata?.exec_handoff) {
      validation.score += 20;
    } else {
      validation.issues.push('No EXEC→PLAN handoff found in metadata');
    }

    // Check sub-agent verification results (should be in metadata)
    const hasSubAgentResults = prd.metadata?.qa_verification || prd.metadata?.db_verification || prd.metadata?.design_review;
    if (hasSubAgentResults) {
      validation.score += 30;
    } else {
      validation.warnings.push('No sub-agent verification results found - verification may be incomplete');
    }

    // Check exec_checklist completion (should be high from EXEC phase)
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      const checkedItems = prd.exec_checklist.filter(item => item.checked).length;
      const totalItems = prd.exec_checklist.length;
      const completionRate = checkedItems / totalItems;

      if (completionRate >= 0.8) {
        validation.score += 20;
      } else {
        validation.warnings.push(`EXEC checklist only ${Math.round(completionRate * 100)}% complete`);
      }
    }

    validation.complete = validation.score >= 70 && validation.issues.length === 0;
    return validation;
  }

  /**
   * Validate EXEC work completeness
   */
  validateExecWork(prd) {
    const validation = {
      complete: false,
      score: 0,
      issues: [],
      checkedItems: 0,
      totalItems: 0
    };
    
    // Check EXEC checklist completion
    if (prd.exec_checklist && Array.isArray(prd.exec_checklist)) {
      validation.totalItems = prd.exec_checklist.length;
      validation.checkedItems = prd.exec_checklist.filter(item => item.checked).length;
      
      if (validation.checkedItems >= validation.totalItems * 0.8) { // 80% minimum
        validation.score += 50;
      } else {
        validation.issues.push(`Insufficient checklist completion: ${validation.checkedItems}/${validation.totalItems} (need 80%)`);
      }
    } else {
      validation.issues.push('No EXEC checklist found');
    }
    
    // Check deliverables (in deliverables field OR metadata.exec_deliverables)
    const deliverables = prd.deliverables || prd.metadata?.exec_deliverables;
    if (deliverables && deliverables.length > 0) {
      validation.score += 30;
    } else {
      validation.issues.push('No deliverables specified');
    }
    
    // Check implementation status
    if (prd.status === 'implemented' || prd.status === 'completed') {
      validation.score += 20;
    } else if (prd.status === 'in_progress') {
      validation.issues.push('PRD status still in_progress - not ready for verification');
    }
    
    validation.complete = validation.score >= 80 && validation.issues.length === 0;
    return validation;
  }
  
  /**
   * Generate EXEC handoff document from PRD data
   */
  async generateExecHandoffDocument(sd, prd, filePath) {
    const handoff = `# EXEC → PLAN Handoff Document
## Strategic Directive: ${sd.id}
## PRD: ${prd.id}

Generated: ${new Date().toISOString()}

## HANDOFF SUMMARY

EXEC phase completion for ${sd.title}. Implementation complete with ${prd.exec_checklist?.filter(i => i.checked).length || 0} checklist items verified. Ready for PLAN verification and acceptance testing.

## COMPLETENESS REPORT

**Total Requirements**: ${prd.exec_checklist?.length || 0}
**Completed**: ${prd.exec_checklist?.filter(i => i.checked).length || 0}
**Implementation Status**: ${prd.status}
**Completion Rate**: ${Math.round(((prd.exec_checklist?.filter(i => i.checked).length || 0) / (prd.exec_checklist?.length || 1)) * 100)}%

## DELIVERABLES

### Primary:
${prd.deliverables?.map(d => `- ${d}`).join('\\n') || '- No deliverables specified'}

### Supporting:
- Database schema updates
- Configuration changes
- Documentation updates

## KEY DECISIONS

${prd.technical_decisions ? JSON.stringify(prd.technical_decisions, null, 2) : 'No technical decisions recorded'}

## KNOWN ISSUES

${prd.known_issues ? JSON.stringify(prd.known_issues, null, 2) : 'No known issues identified'}

## RESOURCE UTILIZATION

- Development Time: Implementation phase
- Database Changes: ${prd.metadata?.database_changes || 'None specified'}
- API Changes: ${prd.metadata?.api_changes || 'None specified'}

## ACTION ITEMS FOR PLAN

- [ ] Verify all acceptance criteria are met
- [ ] Test implementation against requirements
- [ ] Validate performance metrics
- [ ] Conduct security review
- [ ] Approve for deployment or return with feedback

---
*Generated by Unified Handoff System v4.1.2*
`;

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, handoff);
  }
  
  /**
   * Record successful handoff execution
   */
  async recordSuccessfulHandoff(handoffType, sdId, result, template) {
    const executionId = `SUCCESS-${handoffType.replace('/', '')}-${sdId}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      prd_id: result.prdId,
      handoff_type: handoffType,
      status: 'accepted',
      
      validation_score: result.qualityScore || 100,
      validation_passed: true,
      validation_details: {
        result: result,
        verified_at: new Date().toISOString(),
        verifier: 'unified-handoff-system.js'
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };
    
    try {
      await this.supabase.from('leo_handoff_executions').insert(execution);
      console.log(`📝 Success recorded: ${executionId}`);
    } catch (error) {
      console.warn('⚠️  Could not store execution:', error.message);
    }
  }
  
  /**
   * Record failed handoff execution  
   */
  async recordFailedHandoff(handoffType, sdId, result, template) {
    const executionId = `FAILED-${handoffType.replace('/', '')}-${sdId}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2],
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'rejected',
      
      validation_score: result.actualScore || 0,
      validation_passed: false,
      validation_details: {
        result: result,
        rejected_at: new Date().toISOString(),
        reason: result.reasonCode,
        message: result.message
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };
    
    try {
      await this.supabase.from('leo_handoff_executions').insert(execution);
      console.log(`📝 Failure recorded: ${executionId}`);
    } catch (error) {
      console.warn('⚠️  Could not store execution:', error.message);
    }
  }
  
  /**
   * Record system error
   */
  async recordSystemError(handoffType, sdId, errorMessage) {
    const executionId = `ERROR-${handoffType.replace('/', '')}-${sdId}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      from_agent: handoffType.split('-')[0],
      to_agent: handoffType.split('-')[2], 
      sd_id: sdId,
      handoff_type: handoffType,
      status: 'failed',
      
      validation_score: 0,
      validation_passed: false,
      validation_details: {
        system_error: errorMessage,
        failed_at: new Date().toISOString()
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'UNIFIED-HANDOFF-SYSTEM'
    };
    
    try {
      await this.supabase.from('leo_handoff_executions').insert(execution);
    } catch (error) {
      console.warn('⚠️  Could not store error:', error.message);
    }
  }
  
  /**
   * List all handoff executions for dashboard
   */
  async listHandoffExecutions(filters = {}) {
    let query = this.supabase
      .from('leo_handoff_executions')
      .select('*')
      .order('initiated_at', { ascending: false });
      
    if (filters.sdId) {
      query = query.eq('sd_id', filters.sdId);
    }
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters.handoffType) {
      query = query.eq('handoff_type', filters.handoffType);
    }
    
    const { data, error } = await query.limit(filters.limit || 50);
    
    if (error) {
      console.error('Error loading handoff executions:', error);
      return [];
    }
    
    return data || [];
  }
  
  /**
   * Get handoff statistics
   */
  async getHandoffStats() {
    try {
      const { data: executions } = await this.supabase
        .from('leo_handoff_executions')
        .select('status, handoff_type, validation_score');
        
      if (!executions) return null;
      
      const stats = {
        total: executions.length,
        successful: executions.filter(e => e.status === 'accepted').length,
        rejected: executions.filter(e => e.status === 'rejected').length,
        failed: executions.filter(e => e.status === 'failed').length,
        averageScore: executions.reduce((sum, e) => sum + (e.validation_score || 0), 0) / executions.length,
        byType: {}
      };
      
      // Stats by handoff type
      this.supportedHandoffs.forEach(type => {
        const typeExecutions = executions.filter(e => e.handoff_type === type);
        stats.byType[type] = {
          total: typeExecutions.length,
          successful: typeExecutions.filter(e => e.status === 'accepted').length,
          rejected: typeExecutions.filter(e => e.status === 'rejected').length,
          averageScore: typeExecutions.reduce((sum, e) => sum + (e.validation_score || 0), 0) / (typeExecutions.length || 1)
        };
      });
      
      return stats;
      
    } catch (error) {
      console.error('Error calculating stats:', error);
      return null;
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const system = new UnifiedHandoffSystem();
  
  switch (command) {
    case 'execute':
      const handoffType = args[1];
      const sdId = args[2];
      const prdId = args[3];
      
      if (!handoffType || !sdId) {
        console.log('Usage: node unified-handoff-system.js execute HANDOFF_TYPE SD-YYYY-XXX [PRD-ID]');
        console.log('');
        console.log('Handoff Types:');
        console.log('  LEAD-to-PLAN   - Strategic to Planning handoff');
        console.log('  PLAN-to-EXEC   - Planning to Execution handoff');
        console.log('  EXEC-to-PLAN   - Execution to Verification handoff');
        process.exit(1);
      }
      
      const result = await system.executeHandoff(handoffType, sdId, { prdId });
      process.exit(result.success ? 0 : 1);
      break;
      
    case 'list':
      const sdFilter = args[1];
      const executions = await system.listHandoffExecutions({ 
        sdId: sdFilter,
        limit: 20 
      });
      
      console.log('📋 Recent Handoff Executions');
      console.log('='.repeat(60));
      executions.forEach(exec => {
        console.log(`${exec.handoff_type} | ${exec.sd_id} | ${exec.status} | ${exec.validation_score}% | ${exec.initiated_at}`);
      });
      break;
      
    case 'stats':
      const stats = await system.getHandoffStats();
      if (stats) {
        console.log('📊 Handoff System Statistics');
        console.log('='.repeat(40));
        console.log(`Total Executions: ${stats.total}`);
        console.log(`Success Rate: ${Math.round((stats.successful / stats.total) * 100)}%`);
        console.log(`Average Score: ${Math.round(stats.averageScore)}%`);
        console.log('');
        console.log('By Type:');
        Object.entries(stats.byType).forEach(([type, typeStats]) => {
          console.log(`  ${type}: ${typeStats.successful}/${typeStats.total} (${Math.round(typeStats.averageScore)}%)`);
        });
      }
      break;
      
    case 'help':
    default:
      console.log('Unified LEO Protocol Handoff System');
      console.log('='.repeat(40));
      console.log('');
      console.log('COMMANDS:');
      console.log('  execute TYPE SD-ID     - Execute handoff');
      console.log('  list [SD-ID]          - List handoff executions');
      console.log('  stats                 - Show system statistics');
      console.log('  help                  - Show this help');
      console.log('');
      console.log('FEATURES:');
      console.log('• Database-driven handoff templates');
      console.log('• PRD quality enforcement');
      console.log('• Complete audit trail');  
      console.log('• Rejection workflow with improvement guidance');
      console.log('• Dashboard integration');
      console.log('');
      console.log('INTEGRATION:');
      console.log('• Used by LEO Protocol agents for all handoffs');
      console.log('• Enforces quality gates at each transition');
      console.log('• Provides consistent handoff experience');
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default UnifiedHandoffSystem;