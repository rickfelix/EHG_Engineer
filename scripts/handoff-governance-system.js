#!/usr/bin/env node

/**
 * HANDOFF GOVERNANCE SYSTEM
 *
 * Comprehensive checks and balances for all LEO Protocol handoffs
 * Ensures database-first compliance, validation, and audit trails
 *
 * Features:
 * - Pre-flight checks before handoff creation
 * - Template validation
 * - Required elements enforcement
 * - Automatic database storage
 * - Rejection prevention
 * - Audit trail logging
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class HandoffGovernanceSystem {
  constructor() {
    // Define all valid handoff types and their requirements
    this.handoffTypes = {
      'LEAD-to-PLAN': {
        requiredElements: [
          'executive_summary',
          'business_objectives',
          'success_criteria',
          'priority_level',
          'resource_allocation',
          'timeline_expectations',
          'strategic_alignment'
        ],
        minimumCompleteness: 0,
        validStatuses: ['draft', 'active'],
        nextAgent: 'PLAN'
      },
      'PLAN-to-EXEC': {
        requiredElements: [
          'executive_summary',
          'technical_requirements',
          'acceptance_criteria',
          'implementation_approach',
          'risk_assessment',
          'test_strategy',
          'deliverables_manifest'
        ],
        minimumCompleteness: 100,
        validStatuses: ['approved'],
        nextAgent: 'EXEC'
      },
      'EXEC-to-PLAN': {
        requiredElements: [
          'executive_summary',
          'completeness_report',
          'deliverables_manifest',
          'test_results',
          'known_issues',
          'implementation_evidence',
          'action_items'
        ],
        minimumCompleteness: 100,
        validStatuses: ['in_progress', 'testing'],
        nextAgent: 'PLAN'
      },
      'PLAN-to-LEAD': {
        requiredElements: [
          'executive_summary',
          'verification_results',
          'compliance_status',
          'quality_metrics',
          'recommendations',
          'final_approval_request',
          'deployment_readiness'
        ],
        minimumCompleteness: 100,
        validStatuses: ['pending_approval'],
        nextAgent: 'LEAD'
      }
    };

    this.prohibitedPatterns = [
      /^handoff-.*\.(md|json|txt)$/i,
      /^HANDOFF-.*\.(md|json|txt)$/i,
      /.*-handoff\.(md|json|txt)$/i
    ];
  }

  /**
   * PHASE 1: Pre-Flight Checks
   * Run before any handoff creation attempt
   */
  async preFlightChecks(handoffType, sdId, fromAgent) {
    console.log('\n🔍 PRE-FLIGHT CHECKS');
    console.log('=' .repeat(60));

    const checks = {
      valid: true,
      failures: [],
      warnings: []
    };

    // Check 1: Valid handoff type
    if (!this.handoffTypes[handoffType]) {
      checks.valid = false;
      checks.failures.push({
        check: 'handoff_type',
        message: `Invalid handoff type: ${handoffType}`,
        allowed: Object.keys(this.handoffTypes)
      });
    }

    // Check 2: Database table exists
    const tableExists = await this.checkDatabaseTable('leo_handoff_executions');
    if (!tableExists) {
      checks.valid = false;
      checks.failures.push({
        check: 'database_table',
        message: 'Table leo_handoff_executions does not exist',
        action: 'Run: node scripts/database-first-enforcer.js'
      });
    }

    // Check 3: SD exists and is in correct status
    const sdStatus = await this.checkSDStatus(sdId);
    if (!sdStatus.exists) {
      checks.valid = false;
      checks.failures.push({
        check: 'sd_existence',
        message: `Strategic Directive ${sdId} not found`,
        action: 'Verify SD ID is correct'
      });
    } else if (this.handoffTypes[handoffType]) {
      const validStatuses = this.handoffTypes[handoffType].validStatuses;
      if (!validStatuses.includes(sdStatus.status)) {
        checks.warnings.push({
          check: 'sd_status',
          message: `SD status '${sdStatus.status}' may not be appropriate for ${handoffType}`,
          expected: validStatuses
        });
      }
    }

    // Check 4: Agent authorization
    const authorized = await this.checkAgentAuthorization(fromAgent, handoffType);
    if (!authorized) {
      checks.valid = false;
      checks.failures.push({
        check: 'agent_authorization',
        message: `Agent ${fromAgent} not authorized for ${handoffType}`,
        action: 'Verify correct agent is creating handoff'
      });
    }

    // Check 5: No duplicate pending handoffs
    const duplicates = await this.checkDuplicateHandoffs(sdId, handoffType);
    if (duplicates > 0) {
      checks.warnings.push({
        check: 'duplicate_handoff',
        message: `Found ${duplicates} pending handoff(s) for ${sdId}`,
        action: 'Review existing handoffs before creating new one'
      });
    }

    this.printCheckResults(checks);
    return checks;
  }

  /**
   * PHASE 2: Content Validation
   * Validate handoff content meets requirements
   */
  async validateContent(handoffType, content) {
    console.log('\n📋 CONTENT VALIDATION');
    console.log('=' .repeat(60));

    const validation = {
      valid: true,
      failures: [],
      warnings: [],
      score: 0
    };

    const requirements = this.handoffTypes[handoffType];
    if (!requirements) {
      validation.valid = false;
      validation.failures.push('Invalid handoff type');
      return validation;
    }

    // Check required elements
    let elementsPresent = 0;
    for (const element of requirements.requiredElements) {
      if (content[element]) {
        elementsPresent++;
        console.log(`✅ ${element}: Present`);
      } else {
        validation.failures.push({
          element,
          status: 'missing',
          required: true
        });
        console.log(`❌ ${element}: Missing (REQUIRED)`);
      }
    }

    validation.score = Math.round((elementsPresent / requirements.requiredElements.length) * 100);

    // Check completeness
    if (content.completeness_report) {
      const completeness = content.completeness_report.percentage || 0;
      if (completeness < requirements.minimumCompleteness) {
        validation.valid = false;
        validation.failures.push({
          check: 'completeness',
          current: completeness,
          required: requirements.minimumCompleteness,
          message: `Completeness ${completeness}% below minimum ${requirements.minimumCompleteness}%`
        });
      }
    }

    // Check for empty or placeholder content
    for (const [key, value] of Object.entries(content)) {
      if (typeof value === 'string' &&
          (value.includes('TODO') || value.includes('TBD') || value.includes('PLACEHOLDER'))) {
        validation.warnings.push({
          field: key,
          issue: 'Contains placeholder text',
          found: value.substring(0, 50) + '...'
        });
      }
    }

    validation.valid = validation.failures.length === 0;

    console.log(`\n📊 Validation Score: ${validation.score}%`);
    console.log(`Status: ${validation.valid ? '✅ PASSED' : '❌ FAILED'}`);

    return validation;
  }

  /**
   * PHASE 3: Database Storage
   * Store handoff in database with proper structure
   */
  async storeHandoff(handoffType, content, metadata) {
    console.log('\n💾 DATABASE STORAGE');
    console.log('=' .repeat(60));

    try {
      // Prepare handoff record
      const handoffRecord = {
        from_agent: metadata.fromAgent,
        to_agent: this.handoffTypes[handoffType].nextAgent,
        sd_id: metadata.sdId,
        prd_id: metadata.prdId,
        handoff_type: handoffType,
        content: content,
        status: 'pending_review',
        validation_score: metadata.validationScore,
        created_at: new Date().toISOString()
      };

      // Insert into database
      const { data, error } = await supabase
        .from('leo_handoff_executions')
        .insert(handoffRecord)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Handoff stored successfully`);
      console.log(`📋 Handoff ID: ${data.id}`);
      console.log(`🎯 Status: ${data.status}`);
      console.log(`📊 Validation Score: ${data.validation_score}%`);

      return {
        success: true,
        handoffId: data.id,
        data
      };

    } catch (error) {
      console.error(`❌ Storage failed: ${error.message}`);

      // Fallback: Return error but don't create file
      return {
        success: false,
        error: error.message,
        fallbackPrevented: true
      };
    }
  }

  /**
   * PHASE 4: Audit Trail
   * Log all handoff operations for compliance
   */
  async logAuditTrail(operation, details, success) {
    try {
      await supabase
        .from('leo_protocol_compliance')
        .insert({
          check_type: 'handoff_governance',
          entity_type: 'handoff',
          entity_id: details.handoffId || `${details.handoffType}-${Date.now()}`,
          compliant: success,
          violations: success ? null : details.failures,
          recommendations: details.warnings,
          metadata: {
            operation,
            handoffType: details.handoffType,
            sdId: details.sdId,
            fromAgent: details.fromAgent,
            timestamp: new Date().toISOString()
          },
          enforced_by: 'handoff_governance_system'
        });

      console.log(`📊 Audit logged: ${operation} - ${success ? 'SUCCESS' : 'FAILED'}`);
    } catch (error) {
      console.error(`⚠️  Audit logging failed: ${error.message}`);
    }
  }

  /**
   * PHASE 5: File Prevention
   * Actively prevent file creation for handoffs
   */
  async preventFileCreation(filePath) {
    // Check if file matches prohibited patterns
    const fileName = path.basename(filePath);

    for (const pattern of this.prohibitedPatterns) {
      if (pattern.test(fileName)) {
        console.error('\n⛔ FILE CREATION BLOCKED');
        console.error('=' .repeat(60));
        console.error(`❌ Attempted to create: ${fileName}`);
        console.error('📝 This violates LEO Protocol database-first principles');
        console.error('\n🔧 Required Action:');
        console.error('   Use: node scripts/unified-handoff-system.js');
        console.error('   Or: node scripts/handoff-governance-system.js');

        // Log violation
        await this.logAuditTrail('file_creation_blocked', {
          filePath,
          fileName,
          violation: 'prohibited_handoff_file'
        }, false);

        throw new Error('Handoff file creation blocked - use database storage');
      }
    }
  }

  /**
   * MAIN ORCHESTRATION: Create Governed Handoff
   */
  async createGovernedHandoff(handoffType, sdId, content, options = {}) {
    console.log('\n🏛️ HANDOFF GOVERNANCE SYSTEM');
    console.log('=' .repeat(60));
    console.log(`Type: ${handoffType}`);
    console.log(`SD: ${sdId}`);
    console.log(`From: ${options.fromAgent || 'AUTO'}`);
    console.log('=' .repeat(60));

    // Phase 1: Pre-flight checks
    const preFlightResult = await this.preFlightChecks(
      handoffType,
      sdId,
      options.fromAgent
    );

    if (!preFlightResult.valid) {
      console.error('\n❌ PRE-FLIGHT CHECKS FAILED');
      console.error('Cannot proceed with handoff creation');

      await this.logAuditTrail('preflight_failed', {
        handoffType,
        sdId,
        failures: preFlightResult.failures
      }, false);

      return {
        success: false,
        phase: 'preflight',
        failures: preFlightResult.failures
      };
    }

    // Phase 2: Content validation
    const validationResult = await this.validateContent(handoffType, content);

    if (!validationResult.valid) {
      console.error('\n❌ CONTENT VALIDATION FAILED');
      console.error('Handoff does not meet requirements');

      await this.logAuditTrail('validation_failed', {
        handoffType,
        sdId,
        failures: validationResult.failures,
        score: validationResult.score
      }, false);

      return {
        success: false,
        phase: 'validation',
        failures: validationResult.failures,
        score: validationResult.score
      };
    }

    // Phase 3: Store in database
    const storageResult = await this.storeHandoff(
      handoffType,
      content,
      {
        fromAgent: options.fromAgent,
        sdId,
        prdId: options.prdId,
        validationScore: validationResult.score
      }
    );

    if (!storageResult.success) {
      console.error('\n❌ DATABASE STORAGE FAILED');

      await this.logAuditTrail('storage_failed', {
        handoffType,
        sdId,
        error: storageResult.error
      }, false);

      return {
        success: false,
        phase: 'storage',
        error: storageResult.error
      };
    }

    // Phase 4: Log success
    await this.logAuditTrail('handoff_created', {
      handoffType,
      sdId,
      handoffId: storageResult.handoffId,
      fromAgent: options.fromAgent,
      validationScore: validationResult.score,
      warnings: validationResult.warnings
    }, true);

    console.log('\n✅ HANDOFF SUCCESSFULLY CREATED');
    console.log('=' .repeat(60));
    console.log(`📋 ID: ${storageResult.handoffId}`);
    console.log(`📊 Score: ${validationResult.score}%`);
    console.log(`⚠️  Warnings: ${validationResult.warnings.length}`);
    console.log(`🎯 Next: ${this.handoffTypes[handoffType].nextAgent} agent review`);

    return {
      success: true,
      handoffId: storageResult.handoffId,
      score: validationResult.score,
      warnings: validationResult.warnings,
      nextAgent: this.handoffTypes[handoffType].nextAgent
    };
  }

  // Helper Methods

  async checkDatabaseTable(tableName) {
    const { error } = await supabase
      .from(tableName)
      .select('id')
      .limit(1);

    return !error || error.code !== 'PGRST204';
  }

  async checkSDStatus(sdId) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, status')
      .eq('id', sdId)
      .single();

    return {
      exists: !error && data,
      status: data?.status
    };
  }

  async checkAgentAuthorization(agent, handoffType) {
    // Extract expected from-agent from handoff type
    const expectedAgent = handoffType.split('-to-')[0];
    return agent === expectedAgent;
  }

  async checkDuplicateHandoffs(sdId, handoffType) {
    const { count } = await supabase
      .from('leo_handoff_executions')
      .select('id', { count: 'exact' })
      .eq('sd_id', sdId)
      .eq('handoff_type', handoffType)
      .eq('status', 'pending_review');

    return count || 0;
  }

  printCheckResults(checks) {
    if (checks.valid) {
      console.log('\n✅ All pre-flight checks passed');
    } else {
      console.log('\n❌ Pre-flight checks failed:');
      checks.failures.forEach(f => {
        console.log(`   • ${f.message}`);
        if (f.action) console.log(`     Action: ${f.action}`);
      });
    }

    if (checks.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      checks.warnings.forEach(w => {
        console.log(`   • ${w.message}`);
      });
    }
  }

  /**
   * Generate Governance Report
   */
  async generateGovernanceReport() {
    console.log('\n📊 HANDOFF GOVERNANCE REPORT');
    console.log('=' .repeat(60));

    // Get handoff statistics
    const { data: handoffs, error: handoffError } = await supabase
      .from('leo_handoff_executions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // Get compliance records
    const { data: compliance, error: complianceError } = await supabase
      .from('leo_protocol_compliance')
      .select('*')
      .eq('check_type', 'handoff_governance')
      .order('enforced_at', { ascending: false })
      .limit(100);

    const report = {
      timestamp: new Date().toISOString(),
      handoff_statistics: {
        total: handoffs?.length || 0,
        pending: handoffs?.filter(h => h.status === 'pending_review').length || 0,
        approved: handoffs?.filter(h => h.status === 'approved').length || 0,
        rejected: handoffs?.filter(h => h.status === 'rejected').length || 0
      },
      compliance_statistics: {
        total_checks: compliance?.length || 0,
        successful: compliance?.filter(c => c.compliant).length || 0,
        failed: compliance?.filter(c => !c.compliant).length || 0,
        compliance_rate: compliance?.length > 0
          ? ((compliance.filter(c => c.compliant).length / compliance.length) * 100).toFixed(1) + '%'
          : '0%'
      },
      recent_violations: compliance?.filter(c => !c.compliant).slice(0, 5).map(v => ({
        timestamp: v.enforced_at,
        type: v.metadata?.operation,
        sd: v.metadata?.sdId
      })) || []
    };

    console.log('\n📈 Statistics:');
    console.log(`   Total Handoffs: ${report.handoff_statistics.total}`);
    console.log(`   Pending Review: ${report.handoff_statistics.pending}`);
    console.log(`   Compliance Rate: ${report.compliance_statistics.compliance_rate}`);

    if (report.recent_violations.length > 0) {
      console.log('\n⚠️  Recent Violations:');
      report.recent_violations.forEach(v => {
        console.log(`   • ${v.type} (${v.sd}) - ${new Date(v.timestamp).toLocaleString()}`);
      });
    }

    return report;
  }
}

// Export for use in other scripts
export default HandoffGovernanceSystem;

// CLI Usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const governance = new HandoffGovernanceSystem();

  const command = process.argv[2];

  if (command === 'create') {
    const handoffType = process.argv[3];
    const sdId = process.argv[4];
    const contentFile = process.argv[5];

    if (!handoffType || !sdId) {
      console.error('Usage: node handoff-governance-system.js create <type> <sd-id> [content-file]');
      console.error('Types: LEAD-to-PLAN, PLAN-to-EXEC, EXEC-to-PLAN, PLAN-to-LEAD');
      process.exit(1);
    }

    let content = {};
    if (contentFile) {
      const fileContent = await fs.readFile(contentFile, 'utf-8');
      content = JSON.parse(fileContent);
    }

    governance.createGovernedHandoff(handoffType, sdId, content)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      });

  } else if (command === 'report') {
    governance.generateGovernanceReport();

  } else if (command === 'check-file') {
    const filePath = process.argv[3];
    governance.preventFileCreation(filePath)
      .catch(error => {
        process.exit(1);
      });

  } else {
    console.log('Handoff Governance System');
    console.log('========================');
    console.log('\nCommands:');
    console.log('  create <type> <sd-id> [content-file] - Create governed handoff');
    console.log('  report                                - Generate governance report');
    console.log('  check-file <path>                    - Check if file creation allowed');
    console.log('\nHandoff Types:');
    console.log('  LEAD-to-PLAN, PLAN-to-EXEC, EXEC-to-PLAN, PLAN-to-LEAD');
  }
}