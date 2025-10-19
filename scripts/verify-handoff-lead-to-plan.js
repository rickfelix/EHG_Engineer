#!/usr/bin/env node

/**
 * LEAD → PLAN Handoff Verification Script
 * LEO Protocol v4.1.2 - Strategic Quality Gate
 * 
 * ENFORCES: Strategic Directive must be complete before PLAN phase begins
 * PREVENTS: Incomplete or unclear strategic direction reaching technical planning
 * RETURNS: To LEAD with specific improvement requirements if validation fails
 */

import { createClient } from '@supabase/supabase-js';
import HandoffValidator from './handoff-validator.js';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

class LeadToPlanVerifier {
  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    this.handoffValidator = new HandoffValidator();
    
    // Strategic Directive Quality Requirements (LEO Protocol v4.1.2)
    this.sdRequirements = {
      minimumScore: 100, // MAXIMUM standard - 100% completeness required
      requiredFields: [
        'title',
        'description',
        'scope',                 // What the SD will implement
        'strategic_objectives',  // Updated from business_objectives
        'success_metrics',
        'key_principles',        // Updated from constraints
        'risks',
        'priority'
      ],
      minimumObjectives: 2,
      minimumMetrics: 3,
      minimumConstraints: 1
    };
  }
  
  /**
   * Verify LEAD → PLAN handoff readiness
   */
  async verifyHandoff(sdId) {
    console.log('🔍 LEAD → PLAN HANDOFF VERIFICATION');
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
      
      console.log(`SD Status: ${sd.status}`);
      console.log(`SD Priority: ${sd.priority || 'Not set'}`);
      
      // 2. Load handoff template
      const { data: template } = await this.supabase
        .from('leo_handoff_templates')
        .select('*')
        .eq('from_agent', 'LEAD')
        .eq('to_agent', 'PLAN')
        .single();
        
      // 3. Validate Strategic Directive Completeness
      const sdValidation = this.validateStrategicDirective(sd);
      
      console.log(`\\n📊 SD Completeness Score: ${sdValidation.percentage}%`);
      
      if (!sdValidation.valid || sdValidation.percentage < this.sdRequirements.minimumScore) {
        return this.rejectHandoff(sdId, 'SD_INCOMPLETE', 'Strategic Directive does not meet completeness standards', {
          sdValidation,
          requiredScore: this.sdRequirements.minimumScore,
          actualScore: sdValidation.percentage
        });
      }
      
      // 4. Check Strategic Directive status
      if (sd.status !== 'active' && sd.status !== 'approved' && sd.status !== 'in_progress') {
        return this.rejectHandoff(sdId, 'SD_STATUS', `SD status is '${sd.status}', expected 'active', 'approved', or 'in_progress'`);
      }
      
      // 5. Validate business impact and feasibility
      const feasibilityCheck = this.validateFeasibility(sd);
      if (!feasibilityCheck.passed) {
        return this.rejectHandoff(sdId, 'FEASIBILITY', 'Strategic Directive feasibility concerns identified', {
          feasibilityIssues: feasibilityCheck.issues
        });
      }
      
      // 6. Validate handoff content (if provided)
      const handoffPath = `/mnt/c/_EHG/EHG_Engineer/handoffs/LEAD-to-PLAN-${sdId}.md`;
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
      
      // 7. Check environment readiness
      const envCheck = await this.checkEnvironmentReadiness(sd);
      if (!envCheck.ready) {
        return this.rejectHandoff(sdId, 'ENV_NOT_READY', 'Development environment not ready for planning phase', {
          envIssues: envCheck.issues
        });
      }
      
      // 8. Create handoff execution record
      const execution = await this.createHandoffExecution(sd, template, sdValidation, handoffValidation);
      
      // 9. HANDOFF APPROVED
      console.log('\\n✅ HANDOFF APPROVED');
      console.log('='.repeat(50));
      console.log('✅ Strategic Directive is complete and approved');
      console.log(`✅ SD completeness score: ${sdValidation.percentage}% (≥${this.sdRequirements.minimumScore}%)`);
      console.log('✅ Business objectives clearly defined');
      console.log('✅ Success metrics are measurable');
      console.log('✅ Feasibility confirmed');
      console.log('✅ Environment ready for planning');
      if (handoffValidation) {
        console.log('✅ Handoff document meets protocol standards');
      }
      
      // Update SD to indicate PLAN phase can begin
      await this.supabase
        .from('strategic_directives_v2')
        .update({
          status: 'active',
          phase: 'PLAN',
          updated_at: new Date().toISOString(),
          metadata: {
            ...sd.metadata,
            handoff_to_plan: {
              verified_at: new Date().toISOString(),
              quality_score: sdValidation.percentage,
              verifier: 'verify-handoff-lead-to-plan.js'
            }
          }
        })
        .eq('id', sdId);
      
      console.log('\\n🎯 PLAN PHASE AUTHORIZED');
      console.log('Strategic Directive handed off to PLAN agent for PRD creation');
      
      return {
        success: true,
        executionId: execution.id,
        sdId: sdId,
        qualityScore: sdValidation.percentage
      };
      
    } catch (error) {
      console.error('❌ Handoff verification failed:', error.message);
      return this.rejectHandoff(sdId, 'SYSTEM_ERROR', error.message);
    }
  }
  
  /**
   * Validate Strategic Directive completeness
   */
  validateStrategicDirective(sd) {
    const validation = {
      valid: true,
      score: 0,
      maxScore: 100,
      errors: [],
      warnings: []
    };
    
    // Check required fields (40 points)
    this.sdRequirements.requiredFields.forEach(field => {
      if (!sd[field] || !sd[field].toString().trim()) {
        validation.valid = false;
        validation.errors.push(`Missing required field: ${field}`);
      } else {
        validation.score += 5;
      }
    });
    
    // Validate strategic objectives (20 points)
    if (sd.strategic_objectives) {
      const objectivesText = sd.strategic_objectives.toString();

      // Accept either JSON array or markdown text (minimum 100 chars for quality)
      if (typeof sd.strategic_objectives === 'string' && objectivesText.length >= 100) {
        validation.score += 20;
      } else if (Array.isArray(sd.strategic_objectives)) {
        if (sd.strategic_objectives.length >= this.sdRequirements.minimumObjectives) {
          validation.score += 20;

          // Check objective quality
          sd.strategic_objectives.forEach(obj => {
            if (obj.description && obj.description.length < 20) {
              validation.warnings.push(`Objective "${obj.title || 'unnamed'}" description is too brief`);
            }
          });
        } else {
          validation.errors.push(`Insufficient strategic objectives: ${sd.strategic_objectives.length}/${this.sdRequirements.minimumObjectives}`);
          validation.valid = false;
        }
      } else if (objectivesText.length < 100) {
        validation.errors.push('Strategic objectives text is too brief (minimum 100 characters)');
        validation.valid = false;
      }
    }
    
    // Validate success metrics (20 points)
    if (sd.success_metrics) {
      const metrics = Array.isArray(sd.success_metrics)
        ? sd.success_metrics
        : (typeof sd.success_metrics === 'string' ? JSON.parse(sd.success_metrics) : null);

      if (Array.isArray(metrics) && metrics.length >= this.sdRequirements.minimumMetrics) {
        validation.score += 20;

        // Check for measurable metrics
        let measurableCount = 0;
        metrics.forEach(metric => {
          if (metric.target || metric.goal) {
            measurableCount++;
          }
        });

        if (measurableCount < metrics.length * 0.8) {
          validation.warnings.push('Some success metrics lack measurable targets');
        }
      } else {
        validation.errors.push(`Insufficient success metrics: ${metrics?.length || 0}/${this.sdRequirements.minimumMetrics}`);
        validation.valid = false;
      }
    }
    
    // Validate key principles and risks (20 points)
    if (sd.key_principles && sd.risks) {
      validation.score += 20;
    } else {
      if (!sd.key_principles) validation.errors.push('Missing key principles');
      if (!sd.risks) validation.errors.push('Missing risk assessment');
      validation.valid = false;
    }
    
    validation.percentage = Math.round(validation.score);
    return validation;
  }
  
  /**
   * Validate strategic feasibility
   */
  validateFeasibility(sd) {
    const check = {
      passed: true,
      issues: []
    };
    
    // Check for unrealistic timelines in key principles
    if (sd.key_principles) {
      try {
        const principles = typeof sd.key_principles === 'string'
          ? JSON.parse(sd.key_principles)
          : sd.key_principles;
          
        // Look for timeline constraints in key principles
        const timelineConstraint = Array.isArray(principles)
          ? principles.find(c => c.type === 'timeline' || c.title?.toLowerCase().includes('time'))
          : null;
          
        if (timelineConstraint && timelineConstraint.value) {
          const timeline = timelineConstraint.value.toLowerCase();
          if (timeline.includes('1 day') || timeline.includes('immediate')) {
            check.issues.push('Timeline constraint may be unrealistic for comprehensive implementation');
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors for feasibility check
      }
    }
    
    // Check priority vs complexity alignment
    if (sd.priority === 'LOW' && sd.description?.length > 500) {
      check.issues.push('Low priority directive with high complexity description - consider priority adjustment');
    }
    
    // Validate risk mitigation
    if (sd.risks) {
      try {
        const risks = typeof sd.risks === 'string' ? JSON.parse(sd.risks) : sd.risks;
        if (Array.isArray(risks)) {
          const highRisks = risks.filter(r => r.level === 'HIGH' || r.severity === 'HIGH');
          const withMitigation = highRisks.filter(r => r.mitigation || r.response);
          
          if (highRisks.length > 0 && withMitigation.length < highRisks.length) {
            check.issues.push('High-risk items lack mitigation strategies');
          }
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }
    
    // Only fail for critical feasibility issues
    if (check.issues.some(issue => issue.includes('unrealistic') || issue.includes('lack mitigation'))) {
      check.passed = false;
    }
    
    return check;
  }
  
  /**
   * Check development environment readiness
   */
  async checkEnvironmentReadiness(sd) {
    const check = {
      ready: true,
      issues: []
    };
    
    try {
      // Check database connectivity
      const { error: dbError } = await this.supabase.from('strategic_directives_v2').select('id').limit(1);
      if (dbError) {
        check.ready = false;
        check.issues.push('Database connectivity issue');
      }
      
      // Check required tables exist
      const requiredTables = ['strategic_directives_v2', 'product_requirements_v2'];
      for (const table of requiredTables) {
        const { error } = await this.supabase.from(table).select('*').limit(1);
        if (error) {
          check.ready = false;
          check.issues.push(`Required table missing: ${table}`);
        }
      }
      
      // Check filesystem accessibility
      const projectRoot = '/mnt/c/_EHG/EHG_Engineer';
      if (!fs.existsSync(projectRoot)) {
        check.ready = false;
        check.issues.push('Project filesystem not accessible');
      }
      
      // Check required directories
      const requiredDirs = ['scripts', 'docs/strategic-directives', 'docs/prds'];
      for (const dir of requiredDirs) {
        const fullPath = path.join(projectRoot, dir);
        if (!fs.existsSync(fullPath)) {
          check.issues.push(`Directory missing: ${dir} (will create if needed)`);
        }
      }
      
    } catch (error) {
      check.ready = false;
      check.issues.push(`Environment check failed: ${error.message}`);
    }
    
    return check;
  }
  
  /**
   * Create handoff execution record
   */
  async createHandoffExecution(sd, template, sdValidation, handoffValidation) {
    const executionId = `PLAN-${sd.id}-${Date.now()}`;
    
    const execution = {
      id: executionId,
      template_id: template?.id,
      from_agent: 'LEAD',
      to_agent: 'PLAN',
      sd_id: sd.id,
      handoff_type: 'LEAD-to-PLAN',
      status: 'accepted',
      
      // Summary of strategic direction
      executive_summary: sd.description?.substring(0, 200) + '...',
      
      // Validation results
      validation_score: sdValidation.percentage,
      validation_passed: true,
      validation_details: {
        sd_validation: sdValidation,
        handoff_validation: handoffValidation,
        verified_at: new Date().toISOString(),
        verifier: 'verify-handoff-lead-to-plan.js'
      },
      
      completed_at: new Date().toISOString(),
      created_by: 'LEAD-PLAN-VERIFIER'
    };
    
    // Store execution (if table exists)
    try {
      await this.supabase.from('sd_phase_handoffs').insert(execution);
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
      rejected_by: 'LEAD-PLAN-VERIFIER',
      return_to_agent: 'LEAD',
      details
    };
    
    // Provide specific improvement guidance
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
      timeEstimate: '45-90 minutes',
      instructions: ''
    };
    
    switch (reasonCode) {
      case 'SD_INCOMPLETE':
        const sdValidation = details.sdValidation;
        guidance.required = sdValidation.errors || ['Complete Strategic Directive required fields'];
        guidance.actions = [
          'Review SD validation checklist',
          'Enhance business objectives detail',
          'Add measurable success metrics',
          'Complete constraints and risk analysis'
        ];
        guidance.timeEstimate = '2-3 hours';
        guidance.instructions = `Current SD score: ${details.actualScore}%. Minimum required: ${details.requiredScore}%. Focus on business objectives and success metrics.`;
        break;
        
      case 'SD_STATUS':
        guidance.required = ['Update Strategic Directive status to active or approved'];
        guidance.actions = ['Review SD content', 'Finalize strategic direction', 'Update status to active'];
        guidance.timeEstimate = '30-60 minutes';
        guidance.instructions = 'Strategic Directive must be approved before technical planning can begin.';
        break;
        
      case 'FEASIBILITY':
        guidance.required = details.feasibilityIssues || ['Address feasibility concerns'];
        guidance.actions = ['Review timeline constraints', 'Add risk mitigation strategies', 'Validate priority alignment'];
        guidance.timeEstimate = '1-2 hours';
        guidance.instructions = 'Ensure strategic directive is realistic and achievable within constraints.';
        break;
        
      case 'ENV_NOT_READY':
        guidance.required = details.envIssues || ['Fix development environment issues'];
        guidance.actions = ['Check database connectivity', 'Verify filesystem access', 'Create required directories'];
        guidance.timeEstimate = '30-45 minutes';
        guidance.instructions = 'Development environment must be ready before planning phase can begin.';
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
    
    if (!sdId) {
      console.log('Usage: node verify-handoff-lead-to-plan.js verify SD-YYYY-XXX');
      console.log('       node verify-handoff-lead-to-plan.js help');
      process.exit(1);
    }
    
    const verifier = new LeadToPlanVerifier();
    const result = await verifier.verifyHandoff(sdId);
    
    process.exit(result.success ? 0 : 1);
    
  } else if (command === 'help') {
    console.log('LEAD → PLAN Handoff Verification');
    console.log('='.repeat(40));
    console.log('');
    console.log('This script enforces LEO Protocol v4.1.2 strategic standards.');
    console.log('');
    console.log('REQUIREMENTS CHECKED:');
    console.log('• Strategic Directive completeness (≥85% score)');
    console.log('• Business objectives clearly defined (≥2)');
    console.log('• Success metrics are measurable (≥3)');
    console.log('• Constraints and risk analysis complete');
    console.log('• Strategic feasibility validated');
    console.log('• Development environment ready');
    console.log('• Handoff document meets protocol standards (if provided)');
    console.log('');
    console.log('USAGE:');
    console.log('  verify SD-YYYY-XXX     - Verify handoff for Strategic Directive');
    console.log('  help                   - Show this help');
    console.log('');
    console.log('INTEGRATION:');
    console.log('• Called by LEAD agent before requesting PLAN handoff');
    console.log('• Prevents incomplete strategy from reaching technical planning');
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

export default LeadToPlanVerifier;