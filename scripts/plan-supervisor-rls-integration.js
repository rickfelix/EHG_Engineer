#!/usr/bin/env node

/**
 * PLAN Supervisor RLS Integration
 * Purpose: Integrate RLS policy verification into PLAN supervisor verification phase
 * Usage: Called automatically during PLAN→LEAD handoff via unified-handoff-system.js
 */

import { createClient } from '@supabase/supabase-js';
import RLSVerifier from './verify-rls-policies.js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

class PLANSupervisorRLSIntegration {
  constructor() {
    this.verifier = new RLSVerifier();
  }

  /**
   * Run RLS verification as part of PLAN supervisor checks
   */
  async runRLSVerification() {
    console.log('🔒 Running RLS Policy Verification (PLAN Supervisor)...\n');

    try {
      const results = await this.verifier.verify();

      return {
        success: results.passed,
        score: results.policy_coverage_percentage,
        details: {
          total_tables_checked: results.total_tables_checked,
          tables_with_rls: results.tables_with_rls,
          tables_missing_rls: results.tables_missing_rls,
          tables_with_incomplete_policies: results.tables_with_incomplete_policies,
          failed_tables: results.failed_tables.map(t => ({
            table_name: t.table_name,
            issues: t.issues
          })),
          warnings: results.warnings.map(w => ({
            table_name: w.table_name,
            issues: w.issues,
            missing_policies: w.missing_policies
          })),
          execution_time_ms: results.execution_time_ms
        },
        timestamp: results.timestamp
      };
    } catch (error) {
      console.error('❌ RLS verification failed:', error.message);
      return {
        success: false,
        score: 0,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Store RLS verification results in PRD metadata
   */
  async storeResultsInPRD(prdId, rlsResults) {
    console.log(`📝 Storing RLS verification results in PRD ${prdId}...`);

    try {
      // Fetch existing PRD to preserve other metadata
      const { data: prd, error: fetchError } = await supabase
        .from('product_requirements_v2')
        .select('metadata')
        .eq('id', prdId)
        .single();

      if (fetchError) {
        throw new Error(`Failed to fetch PRD: ${fetchError.message}`);
      }

      // Merge RLS results into metadata
      const updatedMetadata = {
        ...prd.metadata,
        rls_verification: rlsResults,
        plan_supervisor_checks: {
          ...prd.metadata?.plan_supervisor_checks,
          rls_verification: {
            completed: true,
            passed: rlsResults.success,
            score: rlsResults.score,
            timestamp: rlsResults.timestamp
          }
        }
      };

      // Update PRD with results
      const { error: updateError } = await supabase
        .from('product_requirements_v2')
        .update({
          metadata: updatedMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', prdId);

      if (updateError) {
        throw new Error(`Failed to update PRD: ${updateError.message}`);
      }

      console.log('✅ RLS verification results stored in PRD metadata');
      return true;

    } catch (error) {
      console.error('❌ Failed to store RLS results:', error.message);
      return false;
    }
  }

  /**
   * Main entry point: Run verification and store results
   */
  async execute(prdId) {
    console.log('🔍 PLAN Supervisor RLS Integration');
    console.log('='.repeat(50));
    console.log(`PRD ID: ${prdId}\n`);

    // Run RLS verification
    const rlsResults = await this.runRLSVerification();

    // Display summary
    console.log('\n📊 RLS Verification Summary:');
    console.log(`   Status: ${rlsResults.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`   Coverage: ${rlsResults.score}%`);
    console.log(`   Tables Checked: ${rlsResults.details?.total_tables_checked || 0}`);
    console.log(`   Tables Missing RLS: ${rlsResults.details?.tables_missing_rls || 0}`);
    console.log(`   Execution Time: ${rlsResults.details?.execution_time_ms || 0}ms`);

    if (rlsResults.details?.failed_tables?.length > 0) {
      console.log('\n❌ Failed Tables:');
      rlsResults.details.failed_tables.forEach(t => {
        console.log(`   - ${t.table_name}: ${t.issues.join(', ')}`);
      });
    }

    // Store results in PRD
    const stored = await this.storeResultsInPRD(prdId, rlsResults);

    if (!stored) {
      console.warn('⚠️  RLS results could not be stored in PRD');
    }

    // Return result for PLAN supervisor
    return {
      verification_type: 'RLS_POLICY_VERIFICATION',
      passed: rlsResults.success,
      score: rlsResults.score,
      required_score: 100, // All tables must have RLS
      details: rlsResults.details,
      blocking: true, // RLS verification failure blocks PLAN→LEAD handoff
      timestamp: rlsResults.timestamp
    };
  }
}

// CLI Entry Point
async function main() {
  const prdId = process.argv[2];

  if (!prdId) {
    console.error('Usage: node plan-supervisor-rls-integration.js <PRD_ID>');
    process.exit(1);
  }

  const integration = new PLANSupervisorRLSIntegration();
  const result = await integration.execute(prdId);

  console.log('\n' + '='.repeat(50));
  console.log('PLAN Supervisor RLS Integration Complete');
  console.log('='.repeat(50));

  // Exit with appropriate code
  process.exit(result.passed ? 0 : 1);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}

export default PLANSupervisorRLSIntegration;
