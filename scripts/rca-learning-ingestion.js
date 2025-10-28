#!/usr/bin/env node

/**
 * RCA Learning Ingestion Job
 * SD-RCA-001
 *
 * Normalizes RCA data into learning signals for EVA preference models.
 * Processes resolved RCRs, extracts ML features, classifies defects, and analyzes preventability.
 *
 * Usage:
 *   node scripts/rca-learning-ingestion.js [--rcr-id UUID] [--batch]
 *
 * @module scripts/rca-learning-ingestion
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * Main ingestion function
 */
async function ingestRCALearnings(options = {}) {
  console.log('🧠 RCA Learning Ingestion Starting...\n');

  let rcrs;

  if (options.rcrId) {
    // Single RCR ingestion
    const { data, error } = await supabase
      .from('root_cause_reports')
      .select(`
        *,
        remediation_manifests (*)
      `)
      .eq('id', options.rcrId)
      .single();

    if (error || !data) {
      console.error(`❌ RCR ${options.rcrId} not found`);
      process.exit(1);
    }

    rcrs = [data];
  } else {
    // Batch ingestion: All RESOLVED RCRs without learning records
    const { data, error } = await supabase
      .from('root_cause_reports')
      .select(`
        *,
        remediation_manifests (*),
        rca_learning_records!inner(id)
      `)
      .eq('status', 'RESOLVED')
      .is('rca_learning_records.id', null)
      .limit(100);

    if (error) {
      console.error('❌ Failed to fetch RCRs:', error);
      process.exit(1);
    }

    rcrs = data || [];
  }

  console.log(`Found ${rcrs.length} RCRs to process\n`);

  for (const rcr of rcrs) {
    await processRCRLearning(rcr);
  }

  console.log('\n✅ Learning ingestion complete');
}

/**
 * Process single RCR into learning record
 */
async function processRCRLearning(rcr) {
  console.log(`Processing RCR ${rcr.id.slice(0, 8)}...`);

  // Extract features for ML
  const features = extractFeatures(rcr);

  // Classify defect
  const defectClass = classifyDefect(rcr);

  // Determine if preventable
  const prevention = analyzePrevention(rcr);

  // Calculate time metrics
  const timeMetrics = calculateTimeMetrics(rcr);

  // Create learning record
  const { data: learningRecord, error } = await supabase
    .from('rca_learning_records')
    .insert({
      rcr_id: rcr.id,
      features: features,
      label: `${rcr.root_cause_category} - ${defectClass}`,
      defect_class: defectClass,
      preventable: prevention.preventable,
      prevention_stage: prevention.stage,
      time_to_detect_hours: timeMetrics.detect_hours,
      time_to_resolve_hours: timeMetrics.resolve_hours,
      metadata: {
        severity: rcr.severity_priority,
        trigger_source: rcr.trigger_source,
        confidence: rcr.confidence,
        impact_level: rcr.impact_level
      }
    })
    .select()
    .single();

  if (error) {
    console.error(`  ❌ Failed: ${error.message}`);
    return;
  }

  // Update retrospective if linked
  if (rcr.retrospective_id) {
    await linkToRetrospective(rcr, learningRecord);
  }

  // Contribute to issue patterns
  await updateIssuePatterns(rcr, learningRecord);

  console.log(`  ✅ Learning record created: ${learningRecord.id.slice(0, 8)}`);
}

/**
 * Extract ML features from RCR
 */
function extractFeatures(rcr) {
  return {
    // Categorical features
    scope_type: rcr.scope_type,
    trigger_source: rcr.trigger_source,
    root_cause_category: rcr.root_cause_category,
    impact_level: rcr.impact_level,
    likelihood_level: rcr.likelihood_level,
    severity_priority: rcr.severity_priority,

    // Numerical features
    confidence: rcr.confidence,
    log_quality: rcr.log_quality || 0,
    evidence_strength: rcr.evidence_strength || 0,
    pattern_match_score: rcr.pattern_match_score || 0,
    recurrence_count: rcr.recurrence_count || 1,
    analysis_attempts: rcr.analysis_attempts || 1,

    // Temporal features
    hour_of_day: new Date(rcr.detected_at).getHours(),
    day_of_week: new Date(rcr.detected_at).getDay(),

    // Context features
    has_repro_steps: !!rcr.repro_steps,
    repro_success_rate: rcr.repro_success_rate || 0,
    has_stack_trace: !!(rcr.evidence_refs?.stack_traces || rcr.evidence_refs?.stack_trace),
    has_logs: !!(rcr.evidence_refs?.logs),
    has_screenshots: !!(rcr.evidence_refs?.screenshots || rcr.evidence_refs?.screenshot_url),

    // CAPA features
    capa_risk_score: rcr.remediation_manifests?.[0]?.risk_score || 0,
    affected_sd_count: rcr.remediation_manifests?.[0]?.affected_sd_count || 1,
    preventive_action_count: rcr.remediation_manifests?.[0]?.preventive_actions?.length || 0
  };
}

/**
 * Classify defect into taxonomy
 */
function classifyDefect(rcr) {
  const category = rcr.root_cause_category;
  const trigger = rcr.trigger_source;

  if (category === 'TEST_COVERAGE_GAP') {
    if (trigger === 'TEST_FAILURE') return 'test_coverage_gap_regression';
    return 'test_coverage_gap_initial';
  }

  if (category === 'CODE_DEFECT') {
    if (rcr.evidence_refs?.stack_trace) return 'code_defect_runtime';
    return 'code_defect_logic';
  }

  if (category === 'CONFIG_ERROR') {
    if (trigger === 'CI_PIPELINE') return 'config_error_ci';
    if (trigger === 'RUNTIME') return 'config_error_env';
    return 'config_error_application';
  }

  if (category === 'REQUIREMENTS_AMBIGUITY') {
    return 'requirements_ambiguity';
  }

  if (category === 'PROCESS_GAP') {
    return 'process_gap';
  }

  return 'uncategorized';
}

/**
 * Analyze if defect was preventable and at which stage
 */
function analyzePrevention(rcr) {
  const category = rcr.root_cause_category;

  // Rule-based prevention analysis
  if (category === 'REQUIREMENTS_AMBIGUITY') {
    return {
      preventable: true,
      stage: 'LEAD_PRE_APPROVAL',
      reason: 'Clearer requirements would have prevented ambiguity'
    };
  }

  if (category === 'TEST_COVERAGE_GAP') {
    return {
      preventable: true,
      stage: 'PLAN_PRD',
      reason: 'Comprehensive test plan would have caught gap'
    };
  }

  if (category === 'CODE_DEFECT' && rcr.trigger_source === 'TEST_FAILURE') {
    return {
      preventable: true,
      stage: 'EXEC_IMPL',
      reason: 'Better unit testing during implementation'
    };
  }

  if (category === 'PROCESS_GAP') {
    return {
      preventable: true,
      stage: 'PLAN_PRD',
      reason: 'Process improvement needed in workflow'
    };
  }

  if (category === 'CONFIG_ERROR') {
    return {
      preventable: true,
      stage: 'PLAN_VERIFY',
      reason: 'Configuration validation during verification'
    };
  }

  return {
    preventable: false,
    stage: 'NEVER',
    reason: 'Inherent complexity or external factor'
  };
}

/**
 * Calculate time-to-detect and time-to-resolve
 */
function calculateTimeMetrics(rcr) {
  const detectedAt = new Date(rcr.detected_at);
  const resolvedAt = rcr.resolved_at ? new Date(rcr.resolved_at) : new Date();

  // Time to resolve (from detection to resolution)
  const resolveMs = resolvedAt - detectedAt;
  const resolve_hours = resolveMs / (1000 * 60 * 60);

  // Time to detect (estimate: first_occurrence to detection)
  let detect_hours = 0;
  if (rcr.first_occurrence_at) {
    const firstOccurrence = new Date(rcr.first_occurrence_at);
    const detectMs = detectedAt - firstOccurrence;
    detect_hours = detectMs / (1000 * 60 * 60);
  }

  return {
    detect_hours: Math.max(0, detect_hours),
    resolve_hours: Math.max(0, resolve_hours)
  };
}

/**
 * Link learning to retrospective
 */
async function linkToRetrospective(rcr, learningRecord) {
  // Add RCA insights to retrospective
  const { error } = await supabase
    .from('retrospectives')
    .update({
      metadata: supabase.sql`
        COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          rca_learning_record_id: learningRecord.id,
          root_cause_category: rcr.root_cause_category,
          defect_class: learningRecord.defect_class,
          preventable: learningRecord.preventable,
          prevention_stage: learningRecord.prevention_stage
        })}::jsonb
      `
    })
    .eq('id', rcr.retrospective_id);

  if (!error) {
    console.log(`  ✅ Linked to retrospective ${rcr.retrospective_id.slice(0, 8)}`);
  }
}

/**
 * Update issue_patterns table with recurrence data
 */
async function updateIssuePatterns(rcr, learningRecord) {
  if (!rcr.pattern_id) return;

  // Check if pattern exists
  const { data: pattern, error: fetchError } = await supabase
    .from('issue_patterns')
    .select('id, occurrence_count')
    .eq('id', rcr.pattern_id)
    .maybeSingle();

  if (fetchError) {
    console.log(`  ⚠️  Could not fetch pattern ${rcr.pattern_id}: ${fetchError.message}`);
    return;
  }

  if (pattern) {
    // Increment occurrence count
    const { error } = await supabase
      .from('issue_patterns')
      .update({
        occurrence_count: pattern.occurrence_count + 1
      })
      .eq('id', rcr.pattern_id);

    if (!error) {
      console.log(`  ✅ Updated pattern ${rcr.pattern_id} (count: ${pattern.occurrence_count + 1})`);
    }
  } else {
    // Create new pattern
    const { error } = await supabase
      .from('issue_patterns')
      .insert({
        id: rcr.pattern_id,
        pattern_name: learningRecord.label,
        category: rcr.root_cause_category,
        severity: rcr.severity_priority,
        occurrence_count: 1,
        first_seen: rcr.first_occurrence_at || rcr.detected_at,
        last_seen: rcr.detected_at,
        metadata: {
          defect_class: learningRecord.defect_class,
          preventable: learningRecord.preventable
        }
      });

    if (!error) {
      console.log(`  ✅ Created pattern ${rcr.pattern_id}`);
    }
  }
}

/**
 * CLI entry point
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--rcr-id') {
      options.rcrId = args[++i];
    } else if (args[i] === '--batch') {
      options.batch = true;
    }
  }

  ingestRCALearnings(options)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
}

export { ingestRCALearnings };
