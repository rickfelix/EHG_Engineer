#!/usr/bin/env node

/**
 * PRD Approval Enforcement System
 *
 * CRITICAL: Prevents LEO Protocol violations by ensuring:
 * 1. Only LEAD can approve PRDs (never PLAN or EXEC)
 * 2. PRDs must be LEAD-approved before EXEC can work
 * 3. PLAN cannot self-approve their own work
 *
 * Created in response to violation where PLAN approved its own PRD
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class PRDApprovalEnforcer {
  constructor() {
    this.violations = [];
    this.fixes = [];
  }

  /**
   * Main enforcement entry point
   */
  async enforce(prdId = null, action = 'validate') {
    console.log(chalk.blue('\n🔒 PRD APPROVAL ENFORCEMENT SYSTEM'));
    console.log(chalk.blue('=' .repeat(50)));
    console.log(chalk.yellow('Preventing PLAN self-approval and EXEC draft work\n'));

    switch (action) {
      case 'validate':
        return await this.validatePRD(prdId);
      case 'audit':
        return await this.auditAllPRDs();
      case 'block':
        return await this.blockInvalidApproval(prdId);
      case 'fix':
        return await this.fixViolations();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  /**
   * Validate a specific PRD's approval status
   */
  async validatePRD(prdId) {
    if (!prdId) {
      console.error(chalk.red('❌ PRD ID required for validation'));
      return { valid: false, reason: 'No PRD ID provided' };
    }

    const { data: prd, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .eq('id', prdId)
      .single();

    if (error || !prd) {
      console.error(chalk.red(`❌ PRD ${prdId} not found`));
      return { valid: false, reason: 'PRD not found' };
    }

    return this.validateApproval(prd);
  }

  /**
   * Core validation logic
   */
  validateApproval(prd) {
    const violations = [];

    console.log(chalk.cyan(`\n📋 Validating PRD: ${prd.id}`));
    console.log(`   Status: ${prd.status}`);
    console.log(`   Approved by: ${prd.approved_by || 'NOT APPROVED'}`);

    // Check 1: If status is 'approved', must be approved by LEAD
    if (prd.status === 'approved') {
      if (prd.approved_by !== 'LEAD') {
        violations.push({
          type: 'INVALID_APPROVER',
          severity: 'CRITICAL',
          message: `PRD approved by '${prd.approved_by}' instead of LEAD`,
          prd_id: prd.id
        });
        console.log(chalk.red(`   ❌ VIOLATION: Approved by ${prd.approved_by} (must be LEAD)`));
      }

      if (!prd.approval_date) {
        violations.push({
          type: 'MISSING_APPROVAL_DATE',
          severity: 'HIGH',
          message: 'PRD marked approved but no approval date',
          prd_id: prd.id
        });
        console.log(chalk.red('   ❌ VIOLATION: No approval date'));
      }
    }

    // Check 2: If PLAN modified approved_by field
    if (prd.approved_by === 'PLAN') {
      violations.push({
        type: 'PLAN_SELF_APPROVAL',
        severity: 'CRITICAL',
        message: 'PLAN cannot approve their own PRD',
        prd_id: prd.id
      });
      console.log(chalk.red('   ❌ VIOLATION: PLAN self-approval detected'));
    }

    // Check 3: If EXEC modified approved_by field
    if (prd.approved_by === 'EXEC') {
      violations.push({
        type: 'EXEC_APPROVAL',
        severity: 'CRITICAL',
        message: 'EXEC cannot approve PRDs',
        prd_id: prd.id
      });
      console.log(chalk.red('   ❌ VIOLATION: EXEC approval detected'));
    }

    // Check 4: Ready for EXEC must have LEAD approval
    if (prd.status === 'ready_for_exec' && prd.approved_by !== 'LEAD') {
      violations.push({
        type: 'EXEC_WITHOUT_APPROVAL',
        severity: 'CRITICAL',
        message: 'PRD marked ready for EXEC without LEAD approval',
        prd_id: prd.id
      });
      console.log(chalk.red('   ❌ VIOLATION: Ready for EXEC without LEAD approval'));
    }

    if (violations.length === 0) {
      console.log(chalk.green('   ✅ PRD approval is valid'));
      return { valid: true, prd };
    } else {
      this.violations.push(...violations);
      return { valid: false, violations, prd };
    }
  }

  /**
   * Audit all PRDs for violations
   */
  async auditAllPRDs() {
    console.log(chalk.blue('\n📊 Auditing all PRDs for approval violations...'));

    const { data: prds, error } = await supabase
      .from('product_requirements_v2')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(chalk.red('Error fetching PRDs:', error.message));
      return;
    }

    console.log(`Found ${prds.length} PRDs to audit\n`);

    let validCount = 0;
    let violationCount = 0;

    for (const prd of prds) {
      const result = this.validateApproval(prd);
      if (result.valid) {
        validCount++;
      } else {
        violationCount++;
      }
    }

    console.log(chalk.blue('\n📈 AUDIT SUMMARY'));
    console.log(chalk.blue('=' .repeat(50)));
    console.log(chalk.green(`✅ Valid PRDs: ${validCount}`));
    console.log(chalk.red(`❌ PRDs with violations: ${violationCount}`));

    if (this.violations.length > 0) {
      console.log(chalk.yellow('\n⚠️  CRITICAL VIOLATIONS FOUND:'));
      const criticalViolations = this.violations.filter(v => v.severity === 'CRITICAL');
      criticalViolations.forEach(v => {
        console.log(chalk.red(`   - ${v.prd_id}: ${v.message}`));
      });
    }

    return {
      totalPRDs: prds.length,
      valid: validCount,
      violations: violationCount,
      criticalViolations: this.violations.filter(v => v.severity === 'CRITICAL')
    };
  }

  /**
   * Block an invalid approval attempt
   */
  async blockInvalidApproval(prdId, attemptedBy = null) {
    console.log(chalk.red('\n🛑 BLOCKING INVALID APPROVAL ATTEMPT'));

    const validation = await this.validatePRD(prdId);

    if (!validation.valid) {
      console.log(chalk.red('❌ Approval blocked due to violations:'));
      validation.violations?.forEach(v => {
        console.log(chalk.red(`   - ${v.message}`));
      });

      // Log the blocked attempt
      await this.logViolationAttempt(prdId, attemptedBy, validation.violations);

      return {
        blocked: true,
        reason: validation.violations,
        message: 'Approval blocked by PRD Approval Enforcer'
      };
    }

    return { blocked: false };
  }

  /**
   * Fix detected violations
   */
  async fixViolations() {
    console.log(chalk.yellow('\n🔧 FIXING APPROVAL VIOLATIONS'));
    console.log(chalk.yellow('=' .repeat(50)));

    if (this.violations.length === 0) {
      await this.auditAllPRDs();
    }

    const criticalViolations = this.violations.filter(v => v.severity === 'CRITICAL');

    for (const violation of criticalViolations) {
      console.log(chalk.yellow(`\nFixing: ${violation.prd_id}`));
      console.log(`   Issue: ${violation.message}`);

      switch (violation.type) {
        case 'PLAN_SELF_APPROVAL':
        case 'EXEC_APPROVAL':
        case 'INVALID_APPROVER':
          // Revert to draft status
          const { error } = await supabase
            .from('product_requirements_v2')
            .update({
              status: 'draft',
              approved_by: null,
              approval_date: null,
              metadata: {
                violation_fixed: true,
                fix_reason: violation.message,
                fixed_at: new Date().toISOString()
              }
            })
            .eq('id', violation.prd_id);

          if (error) {
            console.log(chalk.red(`   ❌ Failed to fix: ${error.message}`));
          } else {
            console.log(chalk.green(`   ✅ Fixed: Reverted to draft status`));
            this.fixes.push({
              prd_id: violation.prd_id,
              action: 'Reverted to draft',
              reason: violation.message
            });
          }
          break;
      }
    }

    console.log(chalk.blue('\n📊 FIX SUMMARY'));
    console.log(chalk.blue('=' .repeat(50)));
    console.log(chalk.green(`✅ Fixed: ${this.fixes.length} violations`));

    return this.fixes;
  }

  /**
   * Log violation attempts for audit trail
   */
  async logViolationAttempt(prdId, attemptedBy, violations) {
    const logEntry = {
      event_type: 'PRD_APPROVAL_VIOLATION',
      event_data: {
        prd_id: prdId,
        attempted_by: attemptedBy,
        violations: violations,
        blocked: true,
        timestamp: new Date().toISOString()
      }
    };

    await supabase.from('leo_events').insert(logEntry);
  }

  /**
   * Check if EXEC can work on a PRD
   */
  async canEXECWork(prdId) {
    const validation = await this.validatePRD(prdId);

    if (!validation.valid) {
      console.log(chalk.red('\n❌ EXEC BLOCKED: PRD not properly approved by LEAD'));
      return false;
    }

    const { prd } = validation;

    if (prd.status !== 'approved' || prd.approved_by !== 'LEAD') {
      console.log(chalk.red('\n❌ EXEC BLOCKED: PRD must be approved by LEAD'));
      console.log(chalk.yellow(`   Current status: ${prd.status}`));
      console.log(chalk.yellow(`   Approved by: ${prd.approved_by || 'Nobody'}`));
      return false;
    }

    console.log(chalk.green('\n✅ EXEC can proceed: PRD properly approved by LEAD'));
    return true;
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const prdIdIndex = args.indexOf('--prd-id');
  const actionIndex = args.indexOf('--action');

  const prdId = prdIdIndex !== -1 ? args[prdIdIndex + 1] : null;
  const action = actionIndex !== -1 ? args[actionIndex + 1] : 'audit';

  const enforcer = new PRDApprovalEnforcer();

  try {
    const result = await enforcer.enforce(prdId, action);

    if (action === 'validate' && !result.valid) {
      process.exit(1); // Exit with error code if validation fails
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}

// Export for use in other scripts
export default PRDApprovalEnforcer;

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}