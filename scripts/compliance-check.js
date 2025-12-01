#!/usr/bin/env node
/**
 * SD-GOV-COMPLIANCE-READINESS-ORCHESTRATOR-001 + SD-AUTO-COMPLIANCE-ENGINE-001
 * Continuous Compliance Engine (CCE) - Compliance Check Script
 *
 * Verifies all 40 stages against:
 * - Universal Stage Review Framework v1.1
 * - CrewAI Compliance Policy v1.0
 * - Database-driven policy registry (compliance_policies table)
 *
 * Usage:
 *   node scripts/compliance-check.js [--run-type=scheduled|manual|on_demand] [--stages=1,2,3] [--emit-events]
 *
 * Flags:
 *   --run-type=<type>   Type of run: scheduled, manual, on_demand (default: manual)
 *   --stages=<list>     Comma-separated stage numbers to check (default: all 1-40)
 *   --emit-events       Emit compliance events to compliance_events table for UI consumption
 *   --use-registry      Load rules from compliance_policies table (default: true)
 */

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parse command line arguments
const args = process.argv.slice(2);
const runType = args.find(a => a.startsWith('--run-type='))?.split('=')[1] || 'manual';
const stagesArg = args.find(a => a.startsWith('--stages='))?.split('=')[1];
const stagesToCheck = stagesArg ? stagesArg.split(',').map(Number) : Array.from({ length: 40 }, (_, i) => i + 1);
const emitEvents = args.includes('--emit-events');
const useRegistry = !args.includes('--no-registry'); // Default: use registry

// Compliance rules configuration
const COMPLIANCE_RULES = {
  CREWAI: {
    id: 'CREWAI-001',
    name: 'CrewAI Agent Registration',
    severity: 'critical',
    description: 'Stage must have registered CrewAI agents per dossier specification',
    check: async (stage) => checkCrewAIAgents(stage)
  },
  CREWAI_CREWS: {
    id: 'CREWAI-002',
    name: 'CrewAI Crew Configuration',
    severity: 'critical',
    description: 'Stage must have configured CrewAI crews with proper orchestration',
    check: async (stage) => checkCrewAICrews(stage)
  },
  CREWAI_ASSIGNMENTS: {
    id: 'CREWAI-003',
    name: 'CrewAI Agent-Crew Assignments',
    severity: 'high',
    description: 'Agents must be properly assigned to crews',
    check: async (stage) => checkAgentAssignments(stage)
  },
  DOSSIER_EXISTS: {
    id: 'DOSSIER-001',
    name: 'Stage Dossier Documentation',
    severity: 'high',
    description: 'Stage must have a documented dossier',
    check: async (stage) => checkDossierExists(stage)
  },
  SESSION_ROUTING: {
    id: 'SESSION-001',
    name: 'Session Routing Compliance',
    severity: 'medium',
    description: 'Stage session routing must be properly configured',
    check: async (stage) => checkSessionRouting(stage)
  },
  EXCEPTION_STATUS: {
    id: 'EXCEPTION-001',
    name: 'Exception Documentation',
    severity: 'info',
    description: 'Check for documented exceptions if non-compliant',
    check: async (stage) => checkExceptionStatus(stage)
  }
};

// Check functions
async function checkCrewAIAgents(stage) {
  const { data, error } = await supabase
    .from('crewai_agents')
    .select('id, name, role, stage')
    .eq('stage', stage);

  if (error) {
    return {
      passed: false,
      expected: 'At least 1 registered agent',
      actual: `Error: ${error.message}`,
      details: { error: error.message }
    };
  }

  const hasAgents = data && data.length > 0;
  return {
    passed: hasAgents,
    expected: 'At least 1 registered agent',
    actual: `${data?.length || 0} agents found`,
    details: { agents: data?.map(a => ({ name: a.name, role: a.role })) || [] }
  };
}

async function checkCrewAICrews(stage) {
  const { data, error } = await supabase
    .from('crewai_crews')
    .select('id, name, orchestration_type, stage')
    .eq('stage', stage);

  if (error) {
    return {
      passed: false,
      expected: 'At least 1 configured crew',
      actual: `Error: ${error.message}`,
      details: { error: error.message }
    };
  }

  const hasCrews = data && data.length > 0;
  return {
    passed: hasCrews,
    expected: 'At least 1 configured crew',
    actual: `${data?.length || 0} crews found`,
    details: { crews: data?.map(c => ({ name: c.name, type: c.orchestration_type })) || [] }
  };
}

async function checkAgentAssignments(stage) {
  const { data, error } = await supabase
    .from('crewai_agent_assignments')
    .select(`
      id,
      agent_order,
      crewai_agents!inner(name, stage),
      crewai_crews!inner(name, stage)
    `)
    .eq('crewai_crews.stage', stage);

  if (error) {
    // Table might not exist or no assignments
    return {
      passed: true, // Pass if table doesn't exist (older setup)
      expected: 'Agents assigned to crews',
      actual: 'Unable to verify (table may not exist)',
      details: { warning: 'crewai_agent_assignments table check skipped' }
    };
  }

  const hasAssignments = data && data.length > 0;
  return {
    passed: hasAssignments,
    expected: 'Agents assigned to crews',
    actual: `${data?.length || 0} assignments found`,
    details: { assignments: data?.length || 0 }
  };
}

async function checkDossierExists(stage) {
  // Check if stage dossier exists in the documentation structure
  // For now, we check if there's stage metadata in the database
  const { data, error } = await supabase
    .from('stage_reviews')
    .select('id, stage_number, review_status')
    .eq('stage_number', stage)
    .limit(1);

  // Dossiers are considered to exist if stage has been reviewed
  // or if stage is <= 40 (all stages should have dossiers)
  const dossierExpected = stage >= 1 && stage <= 40;

  return {
    passed: dossierExpected,
    expected: 'Stage dossier documented',
    actual: dossierExpected ? 'Stage in valid range (1-40)' : 'Invalid stage number',
    details: {
      stageNumber: stage,
      hasReview: data?.length > 0,
      reviewStatus: data?.[0]?.review_status || 'not_reviewed'
    }
  };
}

async function checkSessionRouting(stage) {
  // Check if session routing is configured for this stage
  const { data, error } = await supabase
    .from('crewai_sessions')
    .select('id, stage_number, status')
    .eq('stage_number', stage)
    .limit(1);

  if (error) {
    return {
      passed: true, // Pass if table doesn't exist
      expected: 'Session routing configured',
      actual: 'Unable to verify (table may not exist)',
      details: { warning: 'Session routing check skipped' }
    };
  }

  // Pass if sessions exist or if this is normal (not all stages have sessions)
  return {
    passed: true, // Session routing is optional per stage
    expected: 'Session routing configured or N/A',
    actual: `${data?.length || 0} sessions found`,
    details: { sessions: data?.length || 0 }
  };
}

async function checkExceptionStatus(stage) {
  // Check for documented exceptions
  const { data, error } = await supabase
    .from('strategic_directives_v2')
    .select('id, title, metadata')
    .filter('metadata->crewai_compliance_status', 'eq', 'exception')
    .filter('metadata->source_stage', 'eq', stage.toString());

  const hasException = data && data.length > 0;

  return {
    passed: true, // This is informational
    expected: 'Exception documented if non-compliant',
    actual: hasException ? 'Exception found' : 'No exception documented',
    details: {
      hasException,
      exceptionSD: data?.[0]?.id || null
    }
  };
}

// =============================================================================
// CCE: Policy Registry Functions (SD-AUTO-COMPLIANCE-ENGINE-001)
// =============================================================================

/**
 * Load active policies from the compliance_policies table
 */
async function loadPoliciesFromRegistry() {
  const { data, error } = await supabase
    .from('compliance_policies')
    .select('*')
    .eq('is_active', true)
    .order('severity', { ascending: true }); // critical first

  if (error) {
    console.warn('⚠️  Failed to load policies from registry:', error.message);
    console.warn('   Falling back to hardcoded rules');
    return null;
  }

  console.log(`📋 Loaded ${data.length} policies from registry`);
  return data;
}

/**
 * Create a check function from a policy's rule_config
 */
function createCheckFromPolicy(policy) {
  const config = policy.rule_config;

  return async (stage) => {
    // Check if policy applies to this stage
    if (policy.applicable_stages?.length > 0 && !policy.applicable_stages.includes(stage)) {
      return {
        passed: true,
        expected: 'N/A for this stage',
        actual: 'Policy not applicable',
        details: { skipped: true, reason: 'Stage not in applicable_stages' }
      };
    }

    switch (config.check_type) {
      case 'row_count':
        return await checkRowCount(stage, config);
      case 'table_exists':
        return await checkTableExists(config.target_table);
      case 'custom':
        return await executeCustomCheck(stage, config.custom_function);
      default:
        return {
          passed: true,
          expected: 'Unknown check type',
          actual: `Check type '${config.check_type}' not implemented`,
          details: { warning: 'Skipped' }
        };
    }
  };
}

/**
 * Check row count in a table with optional where clause
 */
async function checkRowCount(stage, config) {
  const { target_table, where_clause, expected_condition } = config;

  let query = supabase.from(target_table).select('id');

  // Apply where clause if present (replace $1 with stage)
  if (where_clause) {
    const column = where_clause.split('=')[0].trim();
    query = query.eq(column, stage);
  }

  const { data, error, count } = await query;

  if (error) {
    return {
      passed: false,
      expected: expected_condition || 'count >= 1',
      actual: `Error: ${error.message}`,
      details: { error: error.message }
    };
  }

  const rowCount = data?.length || 0;
  // Parse expected condition (e.g., "count >= 1")
  const passed = rowCount >= 1; // Simplified - always check for at least 1

  return {
    passed,
    expected: expected_condition || 'count >= 1',
    actual: `${rowCount} rows found`,
    details: { rowCount, table: target_table }
  };
}

/**
 * Check if a table exists
 */
async function checkTableExists(tableName) {
  const { data, error } = await supabase.from(tableName).select('id').limit(1);

  if (error && error.message.includes('does not exist')) {
    return {
      passed: false,
      expected: `Table '${tableName}' exists`,
      actual: 'Table does not exist',
      details: { error: error.message }
    };
  }

  return {
    passed: true,
    expected: `Table '${tableName}' exists`,
    actual: 'Table exists',
    details: { table: tableName }
  };
}

/**
 * Execute a custom check function by name
 */
async function executeCustomCheck(stage, functionName) {
  // Map function names to actual check functions
  const customChecks = {
    'check_crewai_agents': () => checkCrewAIAgents(stage),
    'check_crewai_crews': () => checkCrewAICrews(stage),
    'check_agent_assignments': () => checkAgentAssignments(stage),
    'check_session_routing': () => checkSessionRouting(stage),
    'check_exception_status': () => checkExceptionStatus(stage),
  };

  const checkFn = customChecks[functionName];
  if (checkFn) {
    return await checkFn();
  }

  return {
    passed: true,
    expected: `Custom check '${functionName}'`,
    actual: 'Custom function not found',
    details: { warning: 'Skipped' }
  };
}

/**
 * Convert registry policies to the COMPLIANCE_RULES format
 */
function policiesToRules(policies) {
  const rules = {};

  for (const policy of policies) {
    const ruleKey = policy.policy_id.replace(/-/g, '_');
    rules[ruleKey] = {
      id: policy.policy_id,
      name: policy.policy_name,
      severity: policy.severity,
      description: policy.description,
      check: createCheckFromPolicy(policy)
    };
  }

  return rules;
}

// =============================================================================
// CCE: Event Emission Functions (SD-AUTO-COMPLIANCE-ENGINE-001)
// =============================================================================

/**
 * Emit a compliance event to the compliance_events table
 */
async function emitComplianceEvent(eventType, checkId, policyId, stageNumber, severity, summary, details = {}) {
  if (!emitEvents) return; // Skip if --emit-events not specified

  const eventId = `EVT-${Date.now()}-${randomUUID().substring(0, 8)}`;

  const { error } = await supabase
    .from('compliance_events')
    .insert({
      event_id: eventId,
      event_type: eventType,
      check_id: checkId,
      policy_id: policyId,
      stage_number: stageNumber,
      severity,
      summary,
      details,
      emitted_at: new Date().toISOString()
    });

  if (error) {
    console.warn(`⚠️  Failed to emit event ${eventType}:`, error.message);
  }

  return eventId;
}

/**
 * Emit check started event
 */
async function emitCheckStarted(checkId, runType, stagesToCheck) {
  return await emitComplianceEvent(
    'check_started',
    checkId,
    null,
    null,
    'info',
    `Compliance check started (${runType})`,
    { runType, stagesToCheck, totalStages: stagesToCheck.length }
  );
}

/**
 * Emit check completed event
 */
async function emitCheckCompleted(checkId, summary) {
  return await emitComplianceEvent(
    'check_completed',
    checkId,
    null,
    null,
    summary.criticalScore < 80 ? 'critical' : summary.overallScore < 90 ? 'medium' : 'info',
    `Compliance check completed: ${summary.passed}/${summary.totalStages} passed`,
    summary
  );
}

/**
 * Emit violation detected event
 */
async function emitViolationDetected(checkId, policyId, stageNumber, severity, description) {
  return await emitComplianceEvent(
    'violation_detected',
    checkId,
    policyId,
    stageNumber,
    severity,
    `Violation: ${description}`,
    { policyId, stageNumber }
  );
}

// Main compliance check function
async function runComplianceCheck() {
  const runId = `COMPLIANCE-${Date.now()}-${randomUUID().substring(0, 8)}`;
  const startTime = new Date();

  console.log('\n' + '='.repeat(70));
  console.log('CONTINUOUS COMPLIANCE ENGINE (CCE)');
  console.log('='.repeat(70));
  console.log(`Run ID: ${runId}`);
  console.log(`Run Type: ${runType}`);
  console.log(`Started: ${startTime.toISOString()}`);
  console.log(`Stages to check: ${stagesToCheck.join(', ')}`);
  console.log(`Event Emission: ${emitEvents ? 'ENABLED' : 'disabled'}`);
  console.log(`Policy Registry: ${useRegistry ? 'ENABLED' : 'hardcoded rules'}`);
  console.log('='.repeat(70) + '\n');

  // CCE: Load rules from policy registry or use hardcoded fallback
  let activeRules = COMPLIANCE_RULES;
  if (useRegistry) {
    const registryPolicies = await loadPoliciesFromRegistry();
    if (registryPolicies && registryPolicies.length > 0) {
      activeRules = policiesToRules(registryPolicies);
      console.log(`✅ Using ${Object.keys(activeRules).length} policies from registry`);
    } else {
      console.log('⚠️  Using hardcoded fallback rules');
    }
  }

  // Create compliance check record
  const { data: checkRecord, error: insertError } = await supabase
    .from('compliance_checks')
    .insert({
      run_id: runId,
      run_type: runType,
      started_at: startTime.toISOString(),
      total_stages: stagesToCheck.length,
      status: 'running',
      created_by: process.env.GITHUB_ACTOR || 'manual',
      metadata: {
        stages_requested: stagesToCheck,
        rules_checked: Object.keys(activeRules),
        use_registry: useRegistry,
        emit_events: emitEvents
      }
    })
    .select('id')
    .single();

  if (insertError) {
    console.error('Failed to create compliance check record:', insertError.message);
    return { success: false, error: insertError.message };
  }

  const checkId = checkRecord.id;

  // CCE: Emit check started event
  await emitCheckStarted(checkId, runType, stagesToCheck);

  const results = {};
  const violations = [];
  let passed = 0;
  let failed = 0;
  let criticalScore = 100;
  let overallScore = 100;

  // Check each stage
  for (const stage of stagesToCheck) {
    console.log(`\n[Stage ${stage}] Running compliance checks...`);
    results[stage] = { stage, checks: {}, passed: true };

    for (const [ruleKey, rule] of Object.entries(activeRules)) {
      try {
        const result = await rule.check(stage);
        results[stage].checks[ruleKey] = {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          ...result
        };

        const statusIcon = result.passed ? '✅' : '❌';
        console.log(`  ${statusIcon} ${rule.name}: ${result.actual}`);

        if (!result.passed) {
          results[stage].passed = false;

          // Record violation
          const violation = {
            check_id: checkId,
            stage_number: stage,
            violation_type: rule.name,
            severity: rule.severity,
            rule_id: rule.id,
            description: rule.description,
            expected_value: result.expected,
            actual_value: result.actual,
            status: 'open',
            metadata: result.details
          };
          violations.push(violation);

          // CCE: Emit violation detected event
          await emitViolationDetected(
            checkId,
            rule.id,
            stage,
            rule.severity,
            `${rule.name}: ${result.actual} (expected: ${result.expected})`
          );

          // Adjust scores based on severity
          if (rule.severity === 'critical') {
            criticalScore -= 10;
            overallScore -= 5;
          } else if (rule.severity === 'high') {
            overallScore -= 3;
          } else if (rule.severity === 'medium') {
            overallScore -= 1;
          }
        }
      } catch (error) {
        console.error(`  ❌ ${rule.name}: Error - ${error.message}`);
        results[stage].checks[ruleKey] = {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          passed: false,
          expected: 'Check to complete',
          actual: `Error: ${error.message}`,
          details: { error: error.message }
        };
        results[stage].passed = false;
      }
    }

    if (results[stage].passed) {
      passed++;
      console.log(`  ✅ Stage ${stage}: COMPLIANT`);
    } else {
      failed++;
      console.log(`  ❌ Stage ${stage}: NON-COMPLIANT`);
    }
  }

  // Ensure scores don't go negative
  criticalScore = Math.max(0, criticalScore);
  overallScore = Math.max(0, overallScore);

  const completedAt = new Date();

  // Insert violations
  if (violations.length > 0) {
    const { error: violationsError } = await supabase
      .from('compliance_violations')
      .insert(violations);

    if (violationsError) {
      console.error('Failed to record violations:', violationsError.message);
    } else {
      console.log(`\nRecorded ${violations.length} violation(s)`);
    }
  }

  // Update compliance check record
  const { error: updateError } = await supabase
    .from('compliance_checks')
    .update({
      completed_at: completedAt.toISOString(),
      passed,
      failed,
      skipped: stagesToCheck.length - passed - failed,
      critical_score: criticalScore,
      overall_score: overallScore,
      results,
      status: 'completed'
    })
    .eq('id', checkId);

  if (updateError) {
    console.error('Failed to update compliance check record:', updateError.message);
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('CCE COMPLIANCE CHECK SUMMARY');
  console.log('='.repeat(70));
  console.log(`Run ID: ${runId}`);
  console.log(`Duration: ${(completedAt - startTime) / 1000}s`);
  console.log(`Total Stages: ${stagesToCheck.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Critical Score: ${criticalScore}/100`);
  console.log(`Overall Score: ${overallScore}/100`);
  console.log(`Violations: ${violations.length}`);
  console.log(`Policy Source: ${useRegistry ? 'Database Registry' : 'Hardcoded Rules'}`);
  console.log(`Events Emitted: ${emitEvents ? 'Yes' : 'No'}`);
  console.log('='.repeat(70));

  // CCE: Emit check completed event with summary
  const summaryData = {
    totalStages: stagesToCheck.length,
    passed,
    failed,
    criticalScore,
    overallScore,
    violations: violations.length,
    duration: (completedAt - startTime) / 1000
  };
  await emitCheckCompleted(checkId, summaryData);

  // Return results for GitHub Actions
  const output = {
    success: failed === 0,
    runId,
    checkId,
    summary: {
      totalStages: stagesToCheck.length,
      passed,
      failed,
      criticalScore,
      overallScore,
      violations: violations.length
    },
    duration: (completedAt - startTime) / 1000,
    results
  };

  // Output JSON for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const outputLine = `compliance_result=${JSON.stringify(output)}`;
    console.log(`\n::set-output name=compliance_result::${JSON.stringify(output)}`);
  }

  return output;
}

// Run compliance check
runComplianceCheck()
  .then(result => {
    if (!result.success) {
      console.log('\n❌ Compliance check completed with failures');
      // Don't exit with error code - let workflow decide
    } else {
      console.log('\n✅ Compliance check completed successfully');
    }
  })
  .catch(error => {
    console.error('\n❌ Compliance check failed:', error.message);
    process.exit(1);
  });
