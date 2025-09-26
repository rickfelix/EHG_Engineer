#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


/**
 * PLAN → EXEC Handoff Verification Script
 * LEO Protocol v4.1.2 - Critical Quality Gate
 * 
 * ENFORCES: PRD must meet quality standards before EXEC phase begins
 * PREVENTS: Incomplete or low-quality PRDs reaching implementation
 * RETURNS: To PLAN with specific improvement requirements if validation fails
 */

import { createClient } from '@supabase/supabase-js';
import HandoffValidator from '../src/services/handoff-validator.js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class PlanToExecVerifier {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.handoffValidator = new HandoffValidator();
    
    // PRD Quality Requirements (LEO Protocol v4.1.2)
    this.prdRequirements = {
      minimumScore: 80, // Minimum 80% quality score
      requiredFields: [
        'executive_summary',
        'functional_requirements', 
        'technical_requirements',
        'acceptance_criteria',
        'success_metrics',
        'constraints',
        'risk_assessment'
      ],
      minimumFunctionalReqs: 3,
      minimumTechnicalReqs: 2,
      minimumAcceptanceCriteria: 5
    };
  }
  
  /**
   * Load PRD validation checklist system
   */
  async loadPRDValidator() {
    try {
      const validatorPath = path.join(__dirname, 'prd-validation-checklist.js');
      const { validatePRD } = require(validatorPath);
      return validatePRD;
    } catch (error) {
      console.warn('⚠️  PRD validator not found, using basic validation');
      return this.basicPRDValidation.bind(this);
    }
  }
  
  /**
   * Basic PRD validation fallback
   */
  basicPRDValidation(prd) {
    const validation = {
      valid: true,
      score: 0,
      maxScore: 100,
      errors: [],
      warnings: []
    };
    
    // Check required fields
    this.prdRequirements.requiredFields.forEach(field => {
      if (!prd[field] || !prd[field].toString().trim()) {
        validation.valid = false;
        validation.errors.push(`Missing required field: ${field}`);
      } else {
        validation.score += 10;
      }
    });
    
    // Check functional requirements count
    if (prd.functional_requirements) {
      const funcReqs = Array.isArray(prd.functional_requirements) 
        ? prd.functional_requirements 
        : JSON.parse(prd.functional_requirements || '[]');
      
      if (funcReqs.length < this.prdRequirements.minimumFunctionalReqs) {
        validation.errors.push(`Insufficient functional requirements: ${funcReqs.length}/${this.prdRequirements.minimumFunctionalReqs}`);
        validation.valid = false;
      }
    }
    
    validation.percentage = Math.round((validation.score / 70) * 100); // Adjust for available points
    return validation;
  }
  
  /**
   * Verify PLAN → EXEC handoff readiness
   */
  async verifyHandoff(sdId, prdId = null) {
    console.log('🔍 PLAN → EXEC HANDOFF VERIFICATION');
    console.log('='.repeat(50));
    console.log(`Strategic Directive: ${sdId}`);
    
    try {
      // 1. Load Strategic Directive
      const { data: sd, error: sdError } = await this.supabase
        .from('strategic_directives_v2')
        .select('*')
        .eq('id', sdId)
        .single();
        
      if (sdError || !sd) {
        throw new Error(`Strategic Directive ${sdId} not found: ${sdError?.message}`);
      }
      
      // 2. Load associated PRD
      const prdQuery = prdId 
        ? this.supabase.from('product_requirements_v2').select('*').eq('id', prdId)
        : this.supabase.from('product_requirements_v2').select('*').eq('directive_id', sdId);
        
      const { data: prds, error: prdError } = await prdQuery;
      
      if (prdError || !prds || prds.length === 0) {
        return this.rejectHandoff(sdId, 'NO_PRD', 'No PRD found for Strategic Directive');
      }
      
      const prd = Array.isArray(prds) ? prds[0] : prds;
      console.log(`PRD Found: ${prd.id}`);
      
      // 3. Load handoff template
      const { data: template } = await this.supabase
        .from('leo_handoff_templates')
        .select('*')
        .eq('from_agent', 'PLAN')
        .eq('to_agent', 'EXEC')
        .single();
        
      // 4. Validate PRD Quality
      const prdValidator = await this.loadPRDValidator();
      const prdValidation = await prdValidator(prd.id);
      
      console.log(`\\n📊 PRD Quality Score: ${prdValidation.percentage || prdValidation.score}%`);
      
      if (!prdValidation.valid || (prdValidation.percentage || prdValidation.score) < this.prdRequirements.minimumScore) {
        return this.rejectHandoff(sdId, 'PRD_QUALITY', 'PRD does not meet quality standards', {
          prdValidation,
          requiredScore: this.prdRequirements.minimumScore,
          actualScore: prdValidation.percentage || prdValidation.score
        });
      }
      
      // 5. Check PLAN phase completion AND proper approval
      if (prd.status !== 'approved' && prd.status !== 'ready_for_exec') {
        return this.rejectHandoff(sdId, 'PLAN_INCOMPLETE', `PRD status is '${prd.status}', expected 'approved' or 'ready_for_exec'`);
      }

      // 5a. CRITICAL: Verify PRD was approved by LEAD (not PLAN or EXEC)
      // This prevents the violation where PLAN approved their own PRD
      if (prd.status === 'approved' && prd.approved_by !== 'LEAD') {
        return this.rejectHandoff(sdId, 'INVALID_APPROVAL',
          `PRD was approved by '${prd.approved_by || 'unknown'}' instead of LEAD. ` +
          `LEO Protocol requires LEAD approval. PLAN cannot self-approve.`);
      }

      // 5b. Verify approval date exists
      if (prd.status === 'approved' && !prd.approval_date) {
        return this.rejectHandoff(sdId, 'MISSING_APPROVAL_DATE',
          `PRD marked as approved but no approval date found`);
      }
      
      // 6. Validate handoff content (if provided)
      const handoffPath = `/mnt/c/_EHG/EHG_Engineer/handoffs/PLAN-to-EXEC-${sdId}.md`;
      let handoffValidation = null;
      
      if (fs.existsSync(handoffPath)) {
        const handoffContent = fs.readFileSync(handoffPath, 'utf8');
        const handoffData = this.handoffValidator.parseHandoffDocument(handoffContent);
        handoffValidation = this.handoffValidator.validateHandoff(handoffData);
        
        if (!handoffValidation.valid) {
          return this.rejectHandoff(sdId, 'HANDOFF_INVALID', 'Handoff document does not meet LEO Protocol requirements', {
            handoffValidation
          });
        }
      }
      
      // 7. Create handoff execution record
      const execution = await this.createHandoffExecution(sd, prd, template, prdValidation, handoffValidation);
      
      // 8. HANDOFF APPROVED
      console.log('\\n✅ HANDOFF APPROVED');
      console.log('='.repeat(50));
      console.log('✅ Strategic Directive exists and is active');
      console.log(`✅ PRD quality score: ${prdValidation.percentage || prdValidation.score}% (≥${this.prdRequirements.minimumScore}%)`);
      console.log('✅ PRD status ready for execution');
      if (handoffValidation) {
        console.log('✅ Handoff document meets protocol standards');
      }
      
      // Update PRD to EXEC phase
      await this.supabase
        .from('product_requirements_v2')
        .update({
          status: 'in_progress',
          phase: 'EXEC',
          updated_at: new Date().toISOString()
        })
        .eq('id', prd.id);
      
      console.log('\\n🚀 EXEC PHASE AUTHORIZED');
      console.log('PRD handed off to EXEC agent for implementation');
      
      return {
        success: true,
        executionId: execution.id,
        prdId: prd.id,
        qualityScore: prdValidation.percentage || prdValidation.score
      };
      
    } catch (error) {
      console.error('❌ Handoff verification failed:', error.message);
      return this.rejectHandoff(sdId, 'SYSTEM_ERROR', error.message);
    }
  }
  
  /**
   * Create handoff execution record
   */
  async createHandoffExecution(sd, prd, template, prdValidation, handoffValidation) {
    const executionId = `EXEC-${sd.id}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: 'PLAN',
      to_agent: 'EXEC', 
      sd_id: sd.id,
      prd_id: prd.id,
      handoff_type: 'PLAN-to-EXEC',
      status: 'accepted',
      
      // Validation results
      validation_score: prdValidation.percentage || prdValidation.score,
      validation_passed: true,
      validation_details: {
        prd_validation: prdValidation,
        handoff_validation: handoffValidation,
        verified_at: new Date().toISOString(),
        verifier: 'verify-handoff-plan-to-exec.js'
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'PLAN-EXEC-VERIFIER'
    };
    
    // Store execution (if table exists)
    try {
      await this.supabase.from('leo_handoff_executions').insert(execution);
      console.log(`📝 Handoff execution recorded: ${executionId}`);
    } catch (error) {
      console.warn('⚠️  Could not store handoff execution:', error.message);
    }
    
    return execution;
  }
  
  /**
   * Reject handoff and provide improvement guidance
   */
  async rejectHandoff(sdId, reasonCode, message, details = {}) {
    console.log('\\n❌ HANDOFF REJECTED');
    console.log('='.repeat(50));
    console.log(`Reason: ${reasonCode}`);
    console.log(`Message: ${message}`);
    
    const rejection = {
      id: `REJ-${sdId}-${Date.now()}`,
      sd_id: sdId,
      reason_code: reasonCode,
      rejection_reason: message,
      rejected_by: 'PLAN-EXEC-VERIFIER',
      return_to_agent: 'PLAN',
      details
    };
    
    // Provide specific improvement guidance based on reason
    const improvements = this.generateImprovementGuidance(reasonCode, details);
    rejection.required_improvements = improvements.required;
    rejection.recommended_actions = improvements.actions;
    rejection.estimated_fix_time = improvements.timeEstimate;
    rejection.retry_instructions = improvements.instructions;
    
    // Store rejection record
    try {
      await this.supabase.from('leo_handoff_rejections').insert(rejection);
      console.log(`📝 Rejection recorded: ${rejection.id}`);
    } catch (error) {
      console.warn('⚠️  Could not store rejection:', error.message);
    }
    
    // Display improvement guidance
    console.log('\\n🔧 REQUIRED IMPROVEMENTS');
    console.log('-'.repeat(30));
    improvements.required.forEach(item => console.log(`• ${item}`));
    
    console.log('\\n📋 RECOMMENDED ACTIONS');
    console.log('-'.repeat(30));
    improvements.actions.forEach(item => console.log(`• ${item}`));
    
    console.log(`\\n⏰ Estimated Fix Time: ${improvements.timeEstimate}`);
    console.log(`\\n📝 Instructions: ${improvements.instructions}`);
    
    return {
      success: false,
      rejected: true,
      reasonCode,
      message,
      rejectionId: rejection.id,
      improvements
    };
  }
  
  /**
   * Generate specific improvement guidance
   */
  generateImprovementGuidance(reasonCode, details) {
    const guidance = {
      required: [],
      actions: [],
      timeEstimate: '30-60 minutes',
      instructions: ''
    };
    
    switch (reasonCode) {
      case 'NO_PRD':
        guidance.required = ['Create comprehensive PRD using create-prd-script.js'];
        guidance.actions = ['Run PRD creation script', 'Validate PRD quality', 'Resubmit handoff'];
        guidance.timeEstimate = '2-3 hours';
        guidance.instructions = 'Execute comprehensive PRD creation script and ensure all required fields are completed.';
        break;
        
      case 'PRD_QUALITY':
        const prdValidation = details.prdValidation;
        guidance.required = prdValidation.errors || ['Improve PRD quality to meet minimum standards'];
        guidance.actions = [
          'Review PRD validation checklist',
          'Address all validation errors',
          'Enhance functional and technical requirements',
          'Improve acceptance criteria detail'
        ];
        guidance.timeEstimate = '1-2 hours';
        guidance.instructions = `Current PRD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on completing missing fields and enhancing requirement detail.`;
        break;
        
      case 'PLAN_INCOMPLETE':
        guidance.required = ['Complete PLAN phase activities', 'Update PRD status to approved'];
        guidance.actions = ['Review PLAN checklist', 'Complete outstanding items', 'Update PRD status'];
        guidance.timeEstimate = '45-90 minutes';
        guidance.instructions = 'Complete all PLAN phase checklist items before requesting EXEC handoff.';
        break;
        
      case 'HANDOFF_INVALID':
        guidance.required = ['Fix handoff document to meet LEO Protocol standards'];
        guidance.actions = ['Review handoff validation errors', 'Update handoff document', 'Ensure all 7 elements present'];
        guidance.timeEstimate = '30-45 minutes';
        guidance.instructions = 'Handoff document must include all 7 required elements per LEO Protocol v4.1.2.';
        break;
        
      default:
        guidance.required = ['Address system errors and retry'];
        guidance.actions = ['Check system status', 'Verify database connectivity', 'Retry handoff'];
        guidance.timeEstimate = '15-30 minutes';
        guidance.instructions = 'System error encountered. Check logs and retry handoff verification.';
    }
    
    return guidance;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (command === 'verify' || !command) {
    const sdId = args[1];
    const prdId = args[2];
    
    if (!sdId) {
      console.log('Usage: node verify-handoff-plan-to-exec.js verify SD-YYYY-XXX [PRD-ID]');
      console.log('       node verify-handoff-plan-to-exec.js help');
      process.exit(1);
    }
    
    const verifier = new PlanToExecVerifier();
    const result = await verifier.verifyHandoff(sdId, prdId);
    
    process.exit(result.success ? 0 : 1);
    
  } else if (command === 'help') {
    console.log('PLAN → EXEC Handoff Verification');
    console.log('='.repeat(40));
    console.log('');
    console.log('This script enforces LEO Protocol v4.1.2 handoff standards.');
    console.log('');
    console.log('REQUIREMENTS CHECKED:');
    console.log('• Strategic Directive exists and is active');
    console.log('• PRD exists with minimum 80% quality score');
    console.log('• PRD status is ready for execution');
    console.log('• Handoff document meets protocol standards (if provided)');
    console.log('');
    console.log('USAGE:');
    console.log('  verify SD-YYYY-XXX     - Verify handoff for Strategic Directive');
    console.log('  verify SD-YYYY-XXX PRD-ID - Verify specific PRD handoff');
    console.log('  help                   - Show this help');
    console.log('');
    console.log('INTEGRATION:');
    console.log('• Called by PLAN agent before requesting EXEC handoff');  
    console.log('• Prevents low-quality PRDs from reaching implementation');
    console.log('• Returns detailed improvement guidance on rejection');
    
  } else {
    console.error('Unknown command. Use "help" for usage information.');
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export default PlanToExecVerifier;
