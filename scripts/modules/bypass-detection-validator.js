/**
 * LEO Protocol Bypass Detection Validator
 *
 * SD-LEARN-011: FR-1/FR-2
 *
 * Purpose: Detect when artifacts are created retroactively (out of chronological order)
 * to prevent circumvention of the intended workflow order.
 *
 * Key Behaviors:
 * - Validates artifact timestamps against prerequisite step completion timestamps
 * - 60-second clock skew tolerance
 * - Generates JSON report and Markdown summary for CI
 * - Emits structured audit logs
 *
 * @module bypass-detection-validator
 * @version 1.0.0
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Clock skew tolerance (60 seconds)
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

// Grandfather clause: Only validate artifacts created AFTER this date
// This prevents false positives on SDs that existed before bypass detection was deployed
// SD-LEO-SELF-IMPROVE-001L RCA: Historical SDs created before rules existed
const BYPASS_DETECTION_DEPLOYMENT_DATE = new Date('2026-02-01T00:00:00Z').getTime();

/**
 * Define prerequisite relationships for LEO Protocol phases
 * Each artifact type has prerequisite steps that must complete before it
 */
const PREREQUISITE_MAP = {
  // NOTE: Retrospectives are intentionally NOT validated here.
  // Retrospectives are created DURING EXEC phase by the RETRO sub-agent,
  // then the EXEC-TO-PLAN handoff validates that a quality retrospective exists.
  // Therefore, retrospectives MUST exist BEFORE EXEC-TO-PLAN acceptance, not after.
  //
  // SD-LEO-SELF-IMPROVE-001L RCA: Removed retrospective prerequisite check
  // as it was based on incorrect understanding of LEO Protocol workflow.
  // EXEC-TO-PLAN handoff requires PLAN-TO-EXEC to be accepted first
  'handoff_exec_to_plan': {
    prerequisiteTable: 'sd_phase_handoffs',
    prerequisiteType: 'PLAN-TO-EXEC',
    timestampField: 'accepted_at',
    artifactTimestampField: 'created_at'
  },
  // PLAN-TO-LEAD handoff requires EXEC-TO-PLAN to be accepted first
  'handoff_plan_to_lead': {
    prerequisiteTable: 'sd_phase_handoffs',
    prerequisiteType: 'EXEC-TO-PLAN',
    timestampField: 'accepted_at',
    artifactTimestampField: 'created_at'
  },
  // LEAD-FINAL-APPROVAL requires PLAN-TO-LEAD to be accepted first
  'handoff_lead_final_approval': {
    prerequisiteTable: 'sd_phase_handoffs',
    prerequisiteType: 'PLAN-TO-LEAD',
    timestampField: 'accepted_at',
    artifactTimestampField: 'created_at'
  },
  // PRD requires LEAD-TO-PLAN handoff to be accepted first
  'prd': {
    prerequisiteTable: 'sd_phase_handoffs',
    prerequisiteType: 'LEAD-TO-PLAN',
    timestampField: 'accepted_at',
    artifactTimestampField: 'created_at'
  }
};

/**
 * Bypass Detection Result
 * @typedef {Object} BypassFinding
 * @property {string} sd_id - Strategic Directive ID
 * @property {string} artifact_type - Type of artifact (retrospective, handoff, etc.)
 * @property {string} artifact_id - ID of the artifact
 * @property {string} artifact_timestamp - Timestamp of the artifact
 * @property {string} expected_min_timestamp - Expected minimum timestamp (prerequisite + tolerance)
 * @property {string} prerequisite_type - Type of prerequisite step
 * @property {string} prerequisite_timestamp - Timestamp of prerequisite completion
 * @property {number} time_delta_seconds - Time difference in seconds
 * @property {string} failure_category - Category of failure (bypass)
 */

/**
 * Validate artifact timeline for a single SD
 *
 * @param {string} sdId - Strategic Directive ID
 * @param {Object} supabase - Supabase client
 * @returns {Promise<BypassFinding[]>} Array of bypass findings
 */
async function validateSDTimeline(sdId, supabase) {
  const findings = [];

  // Get all handoffs for this SD
  const { data: handoffs, error: handoffError } = await supabase
    .from('sd_phase_handoffs')
    .select('id, sd_id, handoff_type, status, created_at, accepted_at')
    .eq('sd_id', sdId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: true });

  if (handoffError) {
    console.warn(`Failed to fetch handoffs for ${sdId}: ${handoffError.message}`);
    return findings;
  }

  // Get retrospectives for this SD
  const { data: _retrospectives, error: retroError } = await supabase
    .from('retrospectives')
    .select('id, sd_id, created_at')
    .eq('sd_id', sdId);

  if (retroError) {
    console.warn(`Failed to fetch retrospectives for ${sdId}: ${retroError.message}`);
  }

  // Build timestamp map for handoffs
  const handoffTimestamps = {};
  for (const handoff of handoffs || []) {
    handoffTimestamps[handoff.handoff_type] = {
      id: handoff.id,
      created_at: new Date(handoff.created_at).getTime(),
      accepted_at: handoff.accepted_at ? new Date(handoff.accepted_at).getTime() : null
    };
  }

  // Validate EXEC-TO-PLAN after PLAN-TO-EXEC
  if (handoffTimestamps['EXEC-TO-PLAN'] && handoffTimestamps['PLAN-TO-EXEC']) {
    const execToPlan = handoffTimestamps['EXEC-TO-PLAN'];
    const planToExec = handoffTimestamps['PLAN-TO-EXEC'];

    // Grandfather clause: Skip artifacts created before bypass detection deployment
    if (execToPlan.created_at < BYPASS_DETECTION_DEPLOYMENT_DATE) {
      // Skip - artifact predates bypass detection rules
    } else if (planToExec.accepted_at && execToPlan.created_at < planToExec.accepted_at - CLOCK_SKEW_TOLERANCE_MS) {
      findings.push({
        sd_id: sdId,
        artifact_type: 'handoff_exec_to_plan',
        artifact_id: execToPlan.id,
        artifact_timestamp: new Date(execToPlan.created_at).toISOString(),
        expected_min_timestamp: new Date(planToExec.accepted_at - CLOCK_SKEW_TOLERANCE_MS).toISOString(),
        prerequisite_type: 'PLAN-TO-EXEC',
        prerequisite_timestamp: new Date(planToExec.accepted_at).toISOString(),
        time_delta_seconds: Math.round((planToExec.accepted_at - execToPlan.created_at) / 1000),
        failure_category: 'bypass'
      });
    }
  }

  // Validate PLAN-TO-LEAD after EXEC-TO-PLAN
  if (handoffTimestamps['PLAN-TO-LEAD'] && handoffTimestamps['EXEC-TO-PLAN']) {
    const planToLead = handoffTimestamps['PLAN-TO-LEAD'];
    const execToPlan = handoffTimestamps['EXEC-TO-PLAN'];

    // Grandfather clause: Skip artifacts created before bypass detection deployment
    if (planToLead.created_at < BYPASS_DETECTION_DEPLOYMENT_DATE) {
      // Skip - artifact predates bypass detection rules
    } else if (execToPlan.accepted_at && planToLead.created_at < execToPlan.accepted_at - CLOCK_SKEW_TOLERANCE_MS) {
      findings.push({
        sd_id: sdId,
        artifact_type: 'handoff_plan_to_lead',
        artifact_id: planToLead.id,
        artifact_timestamp: new Date(planToLead.created_at).toISOString(),
        expected_min_timestamp: new Date(execToPlan.accepted_at - CLOCK_SKEW_TOLERANCE_MS).toISOString(),
        prerequisite_type: 'EXEC-TO-PLAN',
        prerequisite_timestamp: new Date(execToPlan.accepted_at).toISOString(),
        time_delta_seconds: Math.round((execToPlan.accepted_at - planToLead.created_at) / 1000),
        failure_category: 'bypass'
      });
    }
  }

  // Validate LEAD-FINAL-APPROVAL after PLAN-TO-LEAD
  if (handoffTimestamps['LEAD-FINAL-APPROVAL'] && handoffTimestamps['PLAN-TO-LEAD']) {
    const leadFinal = handoffTimestamps['LEAD-FINAL-APPROVAL'];
    const planToLead = handoffTimestamps['PLAN-TO-LEAD'];

    // Grandfather clause: Skip artifacts created before bypass detection deployment
    if (leadFinal.created_at < BYPASS_DETECTION_DEPLOYMENT_DATE) {
      // Skip - artifact predates bypass detection rules
    } else if (planToLead.accepted_at && leadFinal.created_at < planToLead.accepted_at - CLOCK_SKEW_TOLERANCE_MS) {
      findings.push({
        sd_id: sdId,
        artifact_type: 'handoff_lead_final_approval',
        artifact_id: leadFinal.id,
        artifact_timestamp: new Date(leadFinal.created_at).toISOString(),
        expected_min_timestamp: new Date(planToLead.accepted_at - CLOCK_SKEW_TOLERANCE_MS).toISOString(),
        prerequisite_type: 'PLAN-TO-LEAD',
        prerequisite_timestamp: new Date(planToLead.accepted_at).toISOString(),
        time_delta_seconds: Math.round((planToLead.accepted_at - leadFinal.created_at) / 1000),
        failure_category: 'bypass'
      });
    }
  }

  // NOTE: Retrospective validation intentionally removed.
  // Retrospectives are created DURING EXEC phase (before EXEC-TO-PLAN handoff).
  // See PREREQUISITE_MAP comment for rationale.

  return findings;
}

/**
 * Run bypass detection validation for all SDs or specific SD
 *
 * @param {Object} options - Validation options
 * @param {string} options.sdId - Optional specific SD ID to validate
 * @param {boolean} options.recentOnly - Only validate SDs modified in last 7 days
 * @param {string} options.outputDir - Directory for output files (default: .leo-validation)
 * @returns {Promise<Object>} Validation result
 */
async function runBypassDetection(options = {}) {
  const { sdId, recentOnly = true, outputDir = '.leo-validation' } = options;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let sdIds = [];

  if (sdId) {
    sdIds = [sdId];
  } else {
    // Get SDs to validate
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key')
      .not('status', 'eq', 'cancelled');

    if (recentOnly) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('updated_at', sevenDaysAgo);
    }

    const { data: sds, error } = await query.limit(500);

    if (error) {
      throw new Error(`Failed to fetch SDs: ${error.message}`);
    }

    sdIds = (sds || []).map(sd => sd.id);
  }

  console.log(`\n🔍 Running bypass detection on ${sdIds.length} SD(s)...\n`);

  const allFindings = [];
  const startTime = Date.now();

  for (const id of sdIds) {
    const findings = await validateSDTimeline(id, supabase);
    allFindings.push(...findings);
  }

  const duration = Date.now() - startTime;

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    duration_ms: duration,
    sds_validated: sdIds.length,
    findings_count: allFindings.length,
    pass: allFindings.length === 0,
    findings: allFindings,
    clock_skew_tolerance_seconds: CLOCK_SKEW_TOLERANCE_MS / 1000,
    grandfather_date: new Date(BYPASS_DETECTION_DEPLOYMENT_DATE).toISOString()
  };

  // Write JSON report
  const jsonPath = path.join(outputDir, 'bypass-detection-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Generate Markdown summary
  const markdown = generateMarkdownSummary(report);
  const mdPath = path.join(outputDir, 'bypass-detection-summary.md');
  fs.writeFileSync(mdPath, markdown);

  // Log audit events for findings
  if (allFindings.length > 0) {
    await logValidationAuditEvents(allFindings, supabase);
  }

  // Console output
  console.log('============================================================');
  console.log('  LEO Protocol Bypass Detection Results');
  console.log('============================================================');
  console.log(`  SDs Validated: ${sdIds.length}`);
  console.log(`  Findings: ${allFindings.length}`);
  console.log(`  Status: ${report.pass ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Duration: ${duration}ms`);
  console.log('------------------------------------------------------------');
  console.log(`  JSON Report: ${jsonPath}`);
  console.log(`  Markdown Summary: ${mdPath}`);
  console.log('============================================================\n');

  if (!report.pass) {
    console.log('⚠️  BYPASS DETECTED:\n');
    for (const finding of allFindings) {
      console.log(`  SD: ${finding.sd_id}`);
      console.log(`  Artifact: ${finding.artifact_type} (${finding.artifact_id})`);
      console.log(`  Created: ${finding.artifact_timestamp}`);
      console.log(`  Expected after: ${finding.expected_min_timestamp}`);
      console.log(`  Prerequisite: ${finding.prerequisite_type} at ${finding.prerequisite_timestamp}`);
      console.log(`  Delta: ${finding.time_delta_seconds}s\n`);
    }
  }

  return report;
}

/**
 * Generate Markdown summary of validation results
 */
function generateMarkdownSummary(report) {
  const lines = [
    '# LEO Protocol Bypass Detection Report',
    '',
    `**Generated:** ${report.timestamp}`,
    `**Status:** ${report.pass ? '✅ PASS' : '❌ FAIL'}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| SDs Validated | ${report.sds_validated} |`,
    `| Findings | ${report.findings_count} |`,
    `| Duration | ${report.duration_ms}ms |`,
    `| Clock Skew Tolerance | ${report.clock_skew_tolerance_seconds}s |`,
    ''
  ];

  if (report.findings.length > 0) {
    lines.push('## Findings');
    lines.push('');

    for (const finding of report.findings) {
      lines.push(`### ${finding.sd_id} - ${finding.artifact_type}`);
      lines.push('');
      lines.push(`- **Artifact ID:** ${finding.artifact_id}`);
      lines.push(`- **Artifact Timestamp:** ${finding.artifact_timestamp}`);
      lines.push(`- **Expected Min Timestamp:** ${finding.expected_min_timestamp}`);
      lines.push(`- **Prerequisite:** ${finding.prerequisite_type}`);
      lines.push(`- **Prerequisite Timestamp:** ${finding.prerequisite_timestamp}`);
      lines.push(`- **Time Delta:** ${finding.time_delta_seconds}s (artifact created ${Math.abs(finding.time_delta_seconds)}s before prerequisite)`);
      lines.push(`- **Category:** ${finding.failure_category}`);
      lines.push('');
    }
  } else {
    lines.push('## No bypass attempts detected');
    lines.push('');
    lines.push('All artifact timestamps are in correct chronological order.');
  }

  return lines.join('\n');
}

/**
 * Log audit events for validation findings
 */
async function logValidationAuditEvents(findings, supabase) {
  const correlationId = `bypass-detection-${Date.now()}`;

  for (const finding of findings) {
    // Log to console in structured format
    console.log(JSON.stringify({
      event: 'validation_failure',
      correlation_id: correlationId,
      sd_id: finding.sd_id,
      sd_type: finding.sd_type || 'unknown',
      validator_name: 'bypass_detection',
      failure_reason: `Artifact ${finding.artifact_type} created before prerequisite ${finding.prerequisite_type}`,
      artifact_id: finding.artifact_id,
      failure_category: finding.failure_category,
      time_delta_seconds: finding.time_delta_seconds
    }));

    // Try to log to audit table if it exists
    try {
      await supabase.from('validation_audit_log').insert({
        correlation_id: correlationId,
        sd_id: finding.sd_id,
        validator_name: 'bypass_detection',
        failure_reason: `Artifact ${finding.artifact_type} created before prerequisite ${finding.prerequisite_type}`,
        artifact_id: finding.artifact_id,
        failure_category: finding.failure_category,
        metadata: finding
      });
    } catch (_err) {
      // Table may not exist - that's OK, we logged to console
    }
  }
}

// Export functions
export {
  runBypassDetection,
  validateSDTimeline,
  generateMarkdownSummary,
  CLOCK_SKEW_TOLERANCE_MS,
  BYPASS_DETECTION_DEPLOYMENT_DATE,
  PREREQUISITE_MAP
};

// CLI execution
if (process.argv[1].endsWith('bypass-detection-validator.js')) {
  const args = process.argv.slice(2);
  const sdId = args.find(a => a.startsWith('--sd='))?.split('=')[1];
  const allSds = args.includes('--all');

  runBypassDetection({
    sdId,
    recentOnly: !allSds
  })
    .then(report => {
      process.exit(report.pass ? 0 : 1);
    })
    .catch(err => {
      console.error('Bypass detection failed:', err.message);
      process.exit(2);
    });
}
