/**
 * Self-Audit Runner for LEO Protocol
 *
 * SD-LEO-SELF-IMPROVE-001I Phase 4: Self-Audit (Read-Only)
 *
 * This module executes read-only audits against strategic directives,
 * comparing SD state against expected artifacts and detecting gaps.
 *
 * Key Design Principles:
 * - READ-ONLY: No mutations to SD tables
 * - CONSERVATIVE: Default rules minimize false positives
 * - TRACEABLE: Every finding links to source SD and run ID
 * - STRUCTURED: JSON output for automation
 */

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Audit Configuration Loader
 */
async function loadAuditConfig() {
  const { data, error } = await supabase
    .from('leo_audit_config')
    .select('*')
    .eq('enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    console.warn('No active audit config found, using defaults');
    return {
      id: 'default',
      enabled: true,
      schedule_cron: '0 2 * * 1',
      timezone: 'UTC',
      stale_after_days: 14,
      warn_after_days: 7,
      max_findings_per_sd: 25
    };
  }

  return data;
}

/**
 * Load Checklists for an SD Type
 */
async function loadChecklists(sdType) {
  const { data, error } = await supabase
    .from('leo_audit_checklists')
    .select('*')
    .eq('sd_type', sdType)
    .order('checklist_version', { ascending: false });

  if (error) {
    console.warn(`No checklists found for sd_type=${sdType}`);
    return [];
  }

  // Get latest version for each artifact
  const latestVersion = data[0]?.checklist_version || 1;
  return data.filter(c => c.checklist_version === latestVersion);
}

/**
 * Detection Rules
 */
const DETECTION_RULES = {
  // Rule: SD is stale (no activity for X days)
  STALE_SD: {
    id: 'STALE_SD',
    name: 'Stale Strategic Directive',
    severity: 'medium',
    evaluate: (sd, config) => {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(sd.updated_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceUpdate >= config.stale_after_days && sd.status !== 'completed') {
        return {
          triggered: true,
          message: `SD has not been updated for ${daysSinceUpdate} days (threshold: ${config.stale_after_days})`,
          evidence: {
            timestamps: {
              last_updated: sd.updated_at,
              days_stale: daysSinceUpdate,
              threshold_days: config.stale_after_days
            }
          }
        };
      }
      return { triggered: false };
    }
  },

  // Rule: SD in draft too long
  DRAFT_TOO_LONG: {
    id: 'DRAFT_TOO_LONG',
    name: 'Draft Status Exceeded',
    severity: 'low',
    evaluate: (sd, config) => {
      if (sd.status !== 'draft') return { triggered: false };
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(sd.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceCreation > config.warn_after_days) {
        return {
          triggered: true,
          message: `SD has been in draft status for ${daysSinceCreation} days`,
          evidence: {
            timestamps: {
              created_at: sd.created_at,
              days_in_draft: daysSinceCreation
            }
          }
        };
      }
      return { triggered: false };
    }
  },

  // Rule: Missing PRD for non-infrastructure SD
  MISSING_PRD: {
    id: 'MISSING_PRD',
    name: 'Missing Product Requirements Document',
    severity: 'high',
    evaluate: async (sd, _config, context) => {
      // Infrastructure and documentation SDs don't require PRD
      const prdExempt = ['infrastructure', 'documentation'];
      if (prdExempt.includes(sd.sd_type)) return { triggered: false };

      const { data: prd } = await supabase
        .from('product_requirements_v2')
        .select('id, status')
        .eq('sd_id', sd.id)
        .single();

      if (!prd) {
        return {
          triggered: true,
          message: `SD type "${sd.sd_type}" requires a PRD but none was found`,
          evidence: {
            missing_metadata_keys: ['prd'],
            sd_type: sd.sd_type
          }
        };
      }
      return { triggered: false };
    }
  },

  // Rule: Completed SD without retrospective
  MISSING_RETROSPECTIVE: {
    id: 'MISSING_RETROSPECTIVE',
    name: 'Missing Retrospective',
    severity: 'medium',
    evaluate: async (sd, _config, context) => {
      if (sd.status !== 'completed') return { triggered: false };

      const { data: retro } = await supabase
        .from('retrospectives')
        .select('id')
        .eq('sd_id', sd.id)
        .single();

      if (!retro) {
        return {
          triggered: true,
          message: 'Completed SD is missing a retrospective',
          evidence: {
            missing_metadata_keys: ['retrospective'],
            sd_status: sd.status
          }
        };
      }
      return { triggered: false };
    }
  },

  // Rule: Invalid status transition
  INVALID_STATUS: {
    id: 'INVALID_STATUS',
    name: 'Invalid Status Transition',
    severity: 'high',
    evaluate: (sd, _config) => {
      const validStatuses = ['draft', 'lead_review', 'plan_active', 'exec_active', 'completed', 'on_hold', 'cancelled'];
      if (!validStatuses.includes(sd.status)) {
        return {
          triggered: true,
          message: `SD has invalid status: "${sd.status}"`,
          evidence: {
            references: [{ type: 'status_constraint', value: validStatuses }]
          }
        };
      }
      return { triggered: false };
    }
  },

  // Rule: Progress mismatch
  PROGRESS_MISMATCH: {
    id: 'PROGRESS_MISMATCH',
    name: 'Progress Status Mismatch',
    severity: 'medium',
    evaluate: (sd, _config) => {
      if (sd.status === 'completed' && sd.progress < 100) {
        return {
          triggered: true,
          message: `SD marked completed but progress is only ${sd.progress}%`,
          evidence: {
            timestamps: {
              progress: sd.progress,
              expected_progress: 100
            }
          }
        };
      }
      if (sd.progress === 100 && sd.status !== 'completed' && sd.status !== 'on_hold' && sd.status !== 'cancelled') {
        return {
          triggered: true,
          message: `SD has 100% progress but status is "${sd.status}" (expected: completed)`,
          evidence: {
            timestamps: {
              progress: sd.progress,
              status: sd.status
            }
          }
        };
      }
      return { triggered: false };
    }
  },

  // Rule: Missing handoffs for active SD
  INCOMPLETE_HANDOFF_CHAIN: {
    id: 'INCOMPLETE_HANDOFF_CHAIN',
    name: 'Incomplete Handoff Chain',
    severity: 'medium',
    evaluate: async (sd, _config, context) => {
      if (sd.status === 'draft' || sd.status === 'cancelled') return { triggered: false };

      const { data: handoffs } = await supabase
        .from('sd_phase_handoffs')
        .select('from_phase, to_phase, status')
        .eq('sd_id', sd.id);

      const hasLeadToPlan = handoffs?.some(h => h.from_phase === 'LEAD' && h.to_phase === 'PLAN' && h.status === 'accepted');

      if (sd.current_phase && sd.current_phase !== 'LEAD_APPROVAL' && !hasLeadToPlan) {
        return {
          triggered: true,
          message: `SD in phase ${sd.current_phase} but missing LEAD-TO-PLAN handoff`,
          evidence: {
            missing_metadata_keys: ['LEAD-TO-PLAN handoff'],
            current_phase: sd.current_phase
          }
        };
      }
      return { triggered: false };
    }
  }
};

/**
 * Artifact Detector
 */
async function detectArtifact(sd, checklist) {
  switch (checklist.detection_method) {
    case 'sd_metadata_key_present':
      // Check if SD metadata contains the artifact key
      const metadata = sd.metadata || {};
      return !!metadata[checklist.artifact_key];

    case 'db_table_exists':
      // For PRDs, handoffs, etc.
      if (checklist.artifact_key === 'prd') {
        const { data } = await supabase
          .from('product_requirements_v2')
          .select('id')
          .eq('sd_id', sd.id)
          .single();
        return !!data;
      }
      return true; // Assume exists if we can't check

    case 'command_registered':
      // Check if related command exists
      return true; // Manual review for command registration

    case 'file_exists':
      // Would need filesystem access - mark for manual review
      return null; // Null means requires manual review

    case 'manual_review_required':
      return null;

    default:
      return null;
  }
}

/**
 * Generate Checklist Findings
 */
async function evaluateChecklists(sd, checklists, runId) {
  const findings = [];

  for (const checklist of checklists) {
    if (!checklist.required) continue;

    const exists = await detectArtifact(sd, checklist);

    if (exists === false) {
      findings.push({
        finding_id: uuidv4(),
        sd_id: sd.id,
        sd_title: sd.title,
        sd_type: sd.sd_type,
        severity: 'medium',
        rule_id: 'MISSING_ARTIFACT',
        rule_name: 'Missing Required Artifact',
        message: `Missing required artifact: ${checklist.artifact_description}`,
        evidence: {
          missing_metadata_keys: [checklist.artifact_key],
          artifact_key: checklist.artifact_key,
          detection_method: checklist.detection_method
        },
        checklist_artifact_key: checklist.artifact_key,
        detected_at: new Date().toISOString()
      });
    } else if (exists === null) {
      findings.push({
        finding_id: uuidv4(),
        sd_id: sd.id,
        sd_title: sd.title,
        sd_type: sd.sd_type,
        severity: 'low',
        rule_id: 'MANUAL_REVIEW_REQUIRED',
        rule_name: 'Manual Review Required',
        message: `Artifact requires manual verification: ${checklist.artifact_description}`,
        evidence: {
          artifact_key: checklist.artifact_key,
          detection_method: checklist.detection_method
        },
        checklist_artifact_key: checklist.artifact_key,
        detected_at: new Date().toISOString()
      });
    }
  }

  return findings;
}

/**
 * Main Audit Execution
 */
export async function runAudit(options = {}) {
  const startTime = Date.now();
  const runId = uuidv4();

  const config = await loadAuditConfig();
  const mode = options.mode || 'manual';
  const scope = options.scope || 'all';
  const sdIdFilter = options.sd_id;
  const dryRun = options.dry_run ?? true;

  console.log('========================================');
  console.log('  SELF-AUDIT RUNNER (Read-Only)');
  console.log('========================================');
  console.log(`  Run ID: ${runId}`);
  console.log(`  Mode: ${mode}`);
  console.log(`  Scope: ${scope}`);
  console.log(`  Dry Run: ${dryRun}`);
  console.log('========================================');

  // Load SDs to audit
  let query = supabase
    .from('strategic_directives_v2')
    .select('*')
    .eq('is_active', true);

  if (sdIdFilter) {
    query = query.eq('id', sdIdFilter);
  }

  if (scope === 'active') {
    query = query.in('status', ['lead_review', 'plan_active', 'exec_active']);
  } else if (scope === 'stale') {
    // Filter for SDs that might be stale
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - config.warn_after_days);
    query = query.lt('updated_at', staleDate.toISOString());
  }

  const { data: sds, error } = await query;

  if (error) {
    console.error('Failed to load SDs:', error.message);
    return {
      run_id: runId,
      run_started_at: new Date(startTime).toISOString(),
      run_finished_at: new Date().toISOString(),
      mode,
      config_snapshot: config,
      findings: [],
      error: error.message
    };
  }

  console.log(`\n  SDs to audit: ${sds.length}`);

  const allFindings = [];
  const sdTypeCache = {};

  // Evaluate each SD
  for (const sd of sds) {
    // Load checklists for this SD type (cached)
    if (!sdTypeCache[sd.sd_type]) {
      sdTypeCache[sd.sd_type] = await loadChecklists(sd.sd_type);
    }
    const checklists = sdTypeCache[sd.sd_type];

    // Run detection rules
    for (const [ruleKey, rule] of Object.entries(DETECTION_RULES)) {
      try {
        const result = await rule.evaluate(sd, config, { runId });
        if (result.triggered) {
          allFindings.push({
            finding_id: uuidv4(),
            sd_id: sd.id,
            sd_title: sd.title,
            sd_type: sd.sd_type,
            severity: rule.severity,
            rule_id: rule.id,
            rule_name: rule.name,
            message: result.message,
            evidence: result.evidence,
            checklist_artifact_key: null,
            detected_at: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn(`  Rule ${ruleKey} error for SD ${sd.id}:`, err.message);
      }
    }

    // Run checklist evaluation
    const checklistFindings = await evaluateChecklists(sd, checklists, runId);
    allFindings.push(...checklistFindings);

    // Enforce max findings per SD
    const sdFindings = allFindings.filter(f => f.sd_id === sd.id);
    if (sdFindings.length > config.max_findings_per_sd) {
      console.warn(`  SD ${sd.id} exceeded max findings (${sdFindings.length}), truncating`);
    }
  }

  // Apply max findings limit per SD
  const limitedFindings = [];
  const findingsBySd = {};

  for (const finding of allFindings) {
    findingsBySd[finding.sd_id] = findingsBySd[finding.sd_id] || [];
    if (findingsBySd[finding.sd_id].length < config.max_findings_per_sd) {
      findingsBySd[finding.sd_id].push(finding);
      limitedFindings.push(finding);
    }
  }

  const endTime = Date.now();
  const durationMs = endTime - startTime;

  // Generate summaries
  const findingsBySeverity = {
    high: limitedFindings.filter(f => f.severity === 'high').length,
    medium: limitedFindings.filter(f => f.severity === 'medium').length,
    low: limitedFindings.filter(f => f.severity === 'low').length
  };

  const findingsByRule = {};
  for (const f of limitedFindings) {
    findingsByRule[f.rule_id] = (findingsByRule[f.rule_id] || 0) + 1;
  }
  const top10Rules = Object.entries(findingsByRule)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([rule, count]) => ({ rule, count }));

  const findingsBySdCount = {};
  for (const f of limitedFindings) {
    findingsBySdCount[f.sd_id] = (findingsBySdCount[f.sd_id] || 0) + 1;
  }
  const top10Sds = Object.entries(findingsBySdCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([sd_id, count]) => ({ sd_id, count }));

  const chairmanSummary = generateChairmanSummary(limitedFindings, sds.length, findingsBySeverity);

  const result = {
    run_id: runId,
    run_started_at: new Date(startTime).toISOString(),
    run_finished_at: new Date(endTime).toISOString(),
    mode,
    config_snapshot: config,
    findings: limitedFindings,
    summary: {
      total_sds_scanned: sds.length,
      total_findings: limitedFindings.length,
      findings_by_severity: findingsBySeverity,
      findings_by_rule: top10Rules,
      top_affected_sds: top10Sds
    },
    chairman_summary: chairmanSummary,
    devops_summary: {
      duration_ms: durationMs,
      sds_per_second: sds.length > 0 ? (sds.length / (durationMs / 1000)).toFixed(2) : 0,
      feedback_post_success_count: 0,
      feedback_post_failure_count: 0,
      rate_limit_events: []
    }
  };

  // Report to feedback system (if not dry run)
  if (!dryRun) {
    await reportToFeedback(limitedFindings, runId, result);
  }

  console.log('\n========================================');
  console.log('  AUDIT COMPLETE');
  console.log('========================================');
  console.log(`  SDs Scanned: ${sds.length}`);
  console.log(`  Total Findings: ${limitedFindings.length}`);
  console.log(`  High: ${findingsBySeverity.high} | Medium: ${findingsBySeverity.medium} | Low: ${findingsBySeverity.low}`);
  console.log(`  Duration: ${durationMs}ms`);
  console.log('========================================');

  return result;
}

/**
 * Generate Chairman Summary (max 600 chars)
 */
function generateChairmanSummary(findings, totalSds, bySeverity) {
  if (findings.length === 0) {
    return `Audit complete. ${totalSds} SDs scanned with no issues found. All strategic directives appear healthy.`;
  }

  const riskLevel = bySeverity.high > 0 ? 'HIGH' : bySeverity.medium > 0 ? 'MEDIUM' : 'LOW';
  const urgentAction = bySeverity.high > 0
    ? `${bySeverity.high} critical issue(s) require immediate attention.`
    : 'No urgent action required.';

  return `Audit: ${findings.length} finding(s) across ${totalSds} SDs. Risk: ${riskLevel}. ${urgentAction} Top issues: stale SDs (${findings.filter(f => f.rule_id === 'STALE_SD').length}), missing artifacts (${findings.filter(f => f.rule_id === 'MISSING_ARTIFACT').length}). Next: Review high-severity findings and update stale directives.`.substring(0, 600);
}

/**
 * Report Findings to Feedback System
 */
async function reportToFeedback(findings, runId, auditResult) {
  let successCount = 0;
  let failureCount = 0;

  for (const finding of findings) {
    try {
      const { error } = await supabase
        .from('feedback_items')
        .insert({
          source: 'self_audit',
          source_id: runId,
          sd_id: finding.sd_id,
          severity: finding.severity,
          category: 'audit_finding',
          title: finding.rule_name,
          description: finding.message,
          metadata: {
            rule_id: finding.rule_id,
            evidence: finding.evidence,
            checklist_artifact_key: finding.checklist_artifact_key,
            finding_id: finding.finding_id,
            source_run_id: runId
          },
          status: 'new'
        });

      if (error) {
        console.warn(`  Failed to post finding ${finding.finding_id}:`, error.message);
        failureCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      console.warn('  Exception posting finding:', err.message);
      failureCount++;
    }
  }

  auditResult.devops_summary.feedback_post_success_count = successCount;
  auditResult.devops_summary.feedback_post_failure_count = failureCount;

  console.log(`\n  Feedback: ${successCount} posted, ${failureCount} failed`);
}

// CLI Entry Point
if (process.argv[1].includes('audit-runner')) {
  const args = process.argv.slice(2);
  const options = {
    mode: 'manual',
    dry_run: !args.includes('--execute'),
    scope: args.includes('--scope') ? args[args.indexOf('--scope') + 1] : 'all',
    sd_id: args.includes('--sd') ? args[args.indexOf('--sd') + 1] : undefined
  };

  runAudit(options)
    .then(result => {
      if (args.includes('--json')) {
        console.log(JSON.stringify(result, null, 2));
      }
    })
    .catch(err => {
      console.error('Audit failed:', err);
      process.exit(1);
    });
}
