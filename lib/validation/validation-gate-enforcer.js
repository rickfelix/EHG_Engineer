#!/usr/bin/env node

/**
 * Validation Gate Enforcer
 * Prevents PRDs from being marked complete without passing UI validation
 * Integrates with LEO Protocol workflow
 */

const { createClient } = require('@supabase/supabase-js');
const UIValidatorPlaywright = require('./ui-validator-playwright');
const PRDRequirementExtractor = require('./prd-requirement-extractor');
require('dotenv').config();

class ValidationGateEnforcer {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    // Validation thresholds
    this.thresholds = {
      minPassRate: 80,        // Minimum 80% tests must pass
      requiredEvidence: true,  // Must have screenshot evidence
      blockOnFailure: true,    // Block completion on validation failure
      requireReview: true      // Require manual review for critical PRDs
    };
    
    // Gate checkpoints from LEO Protocol
    this.checkpoints = [
      'pre_completion',    // Before marking PRD complete
      'pre_handoff',      // Before EXEC → PLAN handoff
      'post_implementation', // After implementation
      'regression'        // During updates
    ];
  }

  /**
   * Enforce validation gate for a PRD
   */
  async enforceGate(prdId, checkpoint = 'pre_completion') {
    console.log('\n🚦 VALIDATION GATE ENFORCEMENT');
    console.log('=' .repeat(50));
    console.log(`PRD: ${prdId}`);
    console.log(`Checkpoint: ${checkpoint}`);
    console.log(`Timestamp: ${new Date().toISOString()}\n`);
    
    try {
      // Step 1: Check if validation is required
      const validationRequired = await this.isValidationRequired(prdId, checkpoint);
      
      if (!validationRequired) {
        console.log('ℹ️ Validation not required for this PRD/checkpoint');
        return { passed: true, reason: 'Validation not required' };
      }
      
      // Step 2: Get latest validation results
      const validationStatus = await this.getValidationStatus(prdId);
      
      // Step 3: Check if fresh validation is needed
      if (this.needsFreshValidation(validationStatus)) {
        console.log('🔄 Running fresh validation...');
        validationStatus.current = await this.runValidation(prdId);
      }
      
      // Step 4: Apply gate rules
      const gateResult = this.applyGateRules(validationStatus, checkpoint);
      
      // Step 5: Update PRD status based on gate result
      await this.updatePRDStatus(prdId, gateResult);
      
      // Step 6: Create audit trail
      await this.createAuditTrail(prdId, checkpoint, gateResult);
      
      // Step 7: Send notifications if needed
      if (!gateResult.passed) {
        await this.sendValidationAlert(prdId, gateResult);
      }
      
      return gateResult;
      
    } catch (error) {
      console.error('❌ Gate enforcement error:', error.message);
      return {
        passed: false,
        error: error.message,
        recommendation: 'Manual review required'
      };
    }
  }

  /**
   * Check if validation is required
   */
  async isValidationRequired(prdId, checkpoint) {
    // Get PRD details
    const { data: prd } = await this.supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();
    
    if (!prd) return false;
    
    // Check if PRD has UI requirements
    const { data: uiRequirements } = await this.supabase
      .from('prd_ui_mappings')
      .select('id')
      .eq('prd_id', prdId)
      .limit(1);
    
    if (!uiRequirements || uiRequirements.length === 0) {
      // No UI requirements - check if we should extract them
      if (this.hasUIKeywords(prd)) {
        console.log('📋 Extracting UI requirements...');
        const extractor = new PRDRequirementExtractor();
        await extractor.processPRD(prdId);
        return true;
      }
      return false;
    }
    
    // Check checkpoint configuration
    const { data: checkpointConfig } = await this.supabase
      .from('ui_validation_checkpoints')
      .select('*')
      .eq('checkpoint_type', checkpoint)
      .eq('active', true)
      .single();
    
    return checkpointConfig && checkpointConfig.block_on_failure;
  }

  /**
   * Get validation status for PRD
   */
  async getValidationStatus(prdId) {
    // Get latest validation results
    const { data: latestValidation } = await this.supabase
      .from('ui_validation_results')
      .select('*')
      .eq('prd_id', prdId)
      .order('created_at', { ascending: false })
      .limit(1);
    
    // Get implementation status
    const { data: requirements } = await this.supabase
      .from('prd_ui_mappings')
      .select('*')
      .eq('prd_id', prdId);
    
    const totalRequirements = requirements?.length || 0;
    const implementedCount = requirements?.filter(r => r.is_implemented).length || 0;
    const validatedCount = requirements?.filter(r => r.is_validated).length || 0;
    
    return {
      hasValidation: latestValidation && latestValidation.length > 0,
      latest: latestValidation?.[0] || null,
      totalRequirements,
      implementedCount,
      validatedCount,
      implementationRate: totalRequirements > 0 ? 
        Math.round((implementedCount / totalRequirements) * 100) : 0,
      validationRate: totalRequirements > 0 ? 
        Math.round((validatedCount / totalRequirements) * 100) : 0
    };
  }

  /**
   * Check if fresh validation is needed
   */
  needsFreshValidation(status) {
    if (!status.hasValidation) return true;
    
    // Check if validation is older than 24 hours
    const validationAge = Date.now() - new Date(status.latest.created_at).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    if (validationAge > maxAge) {
      console.log('⚠️ Validation is older than 24 hours');
      return true;
    }
    
    // Check if implementation changed since last validation
    if (status.implementationRate > status.latest.success_rate) {
      console.log('⚠️ Implementation has changed since last validation');
      return true;
    }
    
    return false;
  }

  /**
   * Run fresh validation
   */
  async runValidation(prdId) {
    const validator = new UIValidatorPlaywright({
      headless: true,
      baseURL: 'http://localhost:3000'
    });
    
    const results = await validator.validatePRD(prdId);
    
    return {
      success_rate: results.successRate,
      total_tests: results.totalTests,
      passed_tests: results.passed,
      failed_tests: results.failed,
      gaps_detected: results.gaps,
      validation_status: results.successRate >= this.thresholds.minPassRate ? 'passed' : 'failed'
    };
  }

  /**
   * Apply gate rules
   */
  applyGateRules(status, checkpoint) {
    const result = {
      passed: false,
      reason: '',
      details: {},
      recommendations: []
    };
    
    // Rule 1: Minimum pass rate
    if (!status.latest || status.latest.success_rate < this.thresholds.minPassRate) {
      result.reason = `Validation pass rate (${status.latest?.success_rate || 0}%) below threshold (${this.thresholds.minPassRate}%)`;
      result.recommendations.push('Fix identified UI gaps before marking complete');
      return result;
    }
    
    // Rule 2: Evidence requirement
    if (this.thresholds.requiredEvidence && (!status.latest.screenshots || status.latest.screenshots.length === 0)) {
      result.reason = 'No screenshot evidence provided';
      result.recommendations.push('Run validation with screenshot capture enabled');
      return result;
    }
    
    // Rule 3: Critical gaps
    if (status.latest.gaps_detected && status.latest.gaps_detected.length > 0) {
      const criticalGaps = status.latest.gaps_detected.filter(g => 
        g.priority === 'critical' || g.requirementId?.includes('DL-')
      );
      
      if (criticalGaps.length > 0) {
        result.reason = `${criticalGaps.length} critical gaps detected`;
        result.details.criticalGaps = criticalGaps;
        result.recommendations.push('Address critical requirements before proceeding');
        return result;
      }
    }
    
    // Rule 4: Checkpoint-specific rules
    if (checkpoint === 'pre_completion' && status.validationRate < 100) {
      result.reason = 'Not all requirements validated';
      result.recommendations.push('Complete validation of all UI requirements');
      return result;
    }
    
    // All rules passed
    result.passed = true;
    result.reason = 'All validation gates passed';
    result.details = {
      successRate: status.latest.success_rate,
      totalTests: status.latest.total_tests,
      passed: status.latest.passed_tests,
      failed: status.latest.failed_tests
    };
    
    return result;
  }

  /**
   * Update PRD status based on gate result
   */
  async updatePRDStatus(prdId, gateResult) {
    if (!gateResult.passed) {
      // Block completion
      const { error } = await this.supabase
        .from('product_requirements_v2')
        .update({
          validation_status: 'failed',
          validation_blocker: true,
          validation_message: gateResult.reason,
          ui_complete: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', prdId);
      
      if (error) {
        console.error('Failed to update PRD status:', error);
      } else {
        console.log('🚫 PRD completion blocked due to validation failure');
      }
    } else {
      // Allow completion
      const { error } = await this.supabase
        .from('product_requirements_v2')
        .update({
          validation_status: 'passed',
          validation_blocker: false,
          validation_message: 'UI validation passed',
          ui_complete: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', prdId);
      
      if (error) {
        console.error('Failed to update PRD status:', error);
      } else {
        console.log('✅ PRD validated and can proceed');
      }
    }
  }

  /**
   * Create audit trail
   */
  async createAuditTrail(prdId, checkpoint, result) {
    const auditEntry = {
      entity_type: 'prd_validation',
      entity_id: prdId,
      action: `validation_gate_${checkpoint}`,
      status: result.passed ? 'passed' : 'blocked',
      details: {
        checkpoint,
        result,
        timestamp: new Date().toISOString(),
        enforcer: 'ValidationGateEnforcer'
      }
    };
    
    // Store in audit log (assuming audit_log table exists)
    // For now, just log to console
    console.log('\n📝 Audit Trail:', JSON.stringify(auditEntry, null, 2));
  }

  /**
   * Send validation alert
   */
  async sendValidationAlert(prdId, result) {
    console.log('\n⚠️ VALIDATION ALERT');
    console.log('-'.repeat(40));
    console.log(`PRD ${prdId} failed validation gate`);
    console.log(`Reason: ${result.reason}`);
    
    if (result.recommendations && result.recommendations.length > 0) {
      console.log('\n📋 Recommendations:');
      result.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }
    
    // In production, this would send notifications via email/Slack/etc.
  }

  /**
   * Check if PRD has UI keywords
   */
  hasUIKeywords(prd) {
    const uiKeywords = ['interface', 'screen', 'button', 'form', 'wizard', 'dashboard', 'UI', 'UX'];
    const content = JSON.stringify(prd).toLowerCase();
    return uiKeywords.some(keyword => content.includes(keyword.toLowerCase()));
  }

  /**
   * Get gate status summary
   */
  async getGateStatus(prdId) {
    const status = await this.getValidationStatus(prdId);
    
    return {
      prdId,
      canComplete: status.latest?.validation_status === 'passed',
      validationRate: status.validationRate,
      implementationRate: status.implementationRate,
      lastValidation: status.latest?.created_at || null,
      gaps: status.latest?.gaps_detected?.length || 0,
      blocker: status.validationRate < this.thresholds.minPassRate
    };
  }
}

module.exports = ValidationGateEnforcer;

// Run enforcement if called directly
if (require.main === module) {
  const prdId = process.argv[2];
  const checkpoint = process.argv[3] || 'pre_completion';
  
  if (!prdId) {
    console.log('Usage: node validation-gate-enforcer.js <PRD_ID> [CHECKPOINT]');
    console.log('Checkpoints: pre_completion, pre_handoff, post_implementation, regression');
    process.exit(1);
  }
  
  const enforcer = new ValidationGateEnforcer();
  
  enforcer.enforceGate(prdId, checkpoint)
    .then(result => {
      console.log('\n' + '='.repeat(50));
      console.log(result.passed ? 
        '✅ VALIDATION GATE PASSED' : 
        '🚫 VALIDATION GATE BLOCKED');
      console.log('='.repeat(50));
      
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}