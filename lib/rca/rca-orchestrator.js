/**
 * RCA Orchestrator - Persists trigger events and invokes RCA analysis
 * SD-LEO-ENH-ENHANCE-RCA-SUB-001
 *
 * Receives TriggerEvents from the Trigger SDK and:
 * 1. Checks rate limits
 * 2. Deduplicates via fingerprinting
 * 3. Creates/updates root_cause_reports
 * 4. Creates/updates issue_patterns
 * 5. Invokes RCA sub-agent for forensic analysis (async, non-blocking)
 * 6. Generates CAPA recommendations
 *
 * @module lib/rca/rca-orchestrator
 */

import dotenv from 'dotenv';
import { checkRateLimit, CLASSIFICATIONS } from './trigger-sdk.js';
import { normalizeSDId } from '../../scripts/modules/sd-id-normalizer.js';

dotenv.config();

// Feature flags
const AUTO_CREATE_FIX_SD = process.env.RCA_AUTO_CREATE_FIX_SD === 'true';
const RECURRENCE_THRESHOLD = parseInt(process.env.RCA_RECURRENCE_THRESHOLD, 10) || 3;
const RECURRENCE_WINDOW_DAYS = parseInt(process.env.RCA_RECURRENCE_WINDOW_DAYS, 10) || 14;

/**
 * Process a TriggerEvent: persist, deduplicate, and optionally invoke RCA
 *
 * This is designed to be FAST and non-blocking. It persists the event
 * and returns immediately. RCA analysis runs async if needed.
 *
 * @param {Object} triggerEvent - Standardized TriggerEvent from trigger-sdk
 * @param {Object} options
 * @param {boolean} [options.skipRCA=false] - Skip RCA sub-agent invocation
 * @param {boolean} [options.verbose=true] - Log progress
 * @returns {Promise<{rcr_id: string|null, issue_pattern_id: string|null, suppressed: boolean}>}
 */
export async function processTriggerEvent(triggerEvent, options = {}) {
  const { skipRCA = false, verbose = true } = options;
  const log = verbose ? console.log.bind(console) : () => {};

  // 1. Rate limit check
  if (!checkRateLimit(triggerEvent.fingerprint)) {
    log(`[RCA-Orchestrator] Rate limited: ${triggerEvent.fingerprint} (suppressed)`);
    return { rcr_id: null, issue_pattern_id: null, suppressed: true };
  }

  let supabase;
  try {
    const { createSupabaseServiceClient } = await import('../../scripts/lib/supabase-connection.js');
    supabase = await createSupabaseServiceClient('engineer', { verbose: false });
  } catch (err) {
    console.error(`[RCA-Orchestrator] Failed to connect to database: ${err.message}`);
    return { rcr_id: null, issue_pattern_id: null, suppressed: false, error: err.message };
  }

  // 1.5. Resolve SD identifier to UUID (prevents FK constraint violations)
  // triggerEvent.sd_id may be an SD key string like "SD-FDBK-ENH-001" instead of a UUID
  let resolvedSdId = null;
  if (triggerEvent.sd_id) {
    try {
      resolvedSdId = await normalizeSDId(supabase, triggerEvent.sd_id);
      if (!resolvedSdId) {
        log(`[RCA-Orchestrator] Could not resolve SD identifier: ${triggerEvent.sd_id} (will use null)`);
      }
    } catch (err) {
      log(`[RCA-Orchestrator] SD ID resolution failed: ${err.message} (will use null)`);
    }
  }

  // 2. Check for existing RCR with same fingerprint
  const { data: existingRCR } = await supabase
    .from('root_cause_reports')
    .select('id, status, recurrence_count, failure_signature')
    .eq('failure_signature', triggerEvent.fingerprint)
    .in('status', ['OPEN', 'IN_REVIEW', 'CAPA_PENDING'])
    .maybeSingle();

  let rcrId = null;

  if (existingRCR) {
    // Increment recurrence instead of creating duplicate
    const newCount = (existingRCR.recurrence_count || 0) + 1;
    await supabase
      .from('root_cause_reports')
      .update({
        recurrence_count: newCount,
        updated_at: new Date().toISOString(),
        metadata: {
          last_recurrence_at: triggerEvent.timestamp,
          last_trigger_type: triggerEvent.trigger_type
        }
      })
      .eq('id', existingRCR.id);

    log(`[RCA-Orchestrator] Recurrence #${newCount} for RCR ${existingRCR.id}`);
    rcrId = existingRCR.id;

    // Check auto-create fix SD threshold
    if (AUTO_CREATE_FIX_SD && newCount >= RECURRENCE_THRESHOLD) {
      await maybeCreateFixSD(supabase, existingRCR.id, triggerEvent, log);
    }
  } else {
    // 3. Create new RCR
    const tier = determineTier(triggerEvent);
    const rcrPayload = {
      scope_type: mapTriggerToScope(triggerEvent.trigger_type),
      scope_id: resolvedSdId || triggerEvent.module,
      sd_id: resolvedSdId,
      trigger_source: mapTriggerToSource(triggerEvent.trigger_type),
      trigger_tier: tier,
      failure_signature: triggerEvent.fingerprint,
      problem_statement: triggerEvent.error_message,
      observed: {
        trigger_type: triggerEvent.trigger_type,
        classification: triggerEvent.classification,
        context: triggerEvent.context,
        exit_code: triggerEvent.exit_code,
        git_sha: triggerEvent.git_sha
      },
      expected: {
        status: 'success',
        exit_code: 0
      },
      impact_level: tier <= 2 ? 'HIGH' : 'MEDIUM',
      likelihood_level: 'OCCASIONAL',
      evidence_refs: {
        stderr: triggerEvent.stderr,
        stdout: triggerEvent.stdout,
        error_stack: triggerEvent.error_stack,
        module: triggerEvent.module
      },
      confidence: 40, // Base confidence, will be updated by RCA analysis
      status: 'OPEN',
      log_quality: triggerEvent.error_stack ? 20 : 10,
      evidence_strength: 10,
      metadata: {
        auto_triggered: true,
        trigger_sdk_version: '1.0.0',
        trigger_timestamp: triggerEvent.timestamp,
        classification: triggerEvent.classification,
        classification_confidence: triggerEvent.classification_confidence
      }
    };

    const { data: newRCR, error: rcrError } = await supabase
      .from('root_cause_reports')
      .insert(rcrPayload)
      .select('id')
      .single();

    if (rcrError) {
      console.error(`[RCA-Orchestrator] Failed to create RCR: ${rcrError.message}`);
      // Still try to create issue pattern even if RCR fails
    } else {
      rcrId = newRCR.id;
      log(`[RCA-Orchestrator] Created RCR: ${rcrId} (${triggerEvent.trigger_type})`);
    }
  }

  // 4. Update/create issue_patterns
  const issuePatternId = await upsertIssuePattern(supabase, triggerEvent, rcrId, log, resolvedSdId);

  // 5. Invoke RCA sub-agent (non-blocking)
  if (!skipRCA && rcrId && !existingRCR) {
    // Fire and forget - don't block the calling process
    invokeRCAAsync(rcrId, log).catch(err => {
      console.error(`[RCA-Orchestrator] Async RCA invocation failed: ${err.message}`);
    });
  }

  return { rcr_id: rcrId, issue_pattern_id: issuePatternId, suppressed: false };
}

/**
 * Map trigger type to existing trigger_source enum
 */
function mapTriggerToSource(triggerType) {
  const mapping = {
    handoff_failure: 'HANDOFF_REJECTION',
    gate_validation_failure: 'QUALITY_GATE',
    api_failure: 'RUNTIME',
    migration_failure: 'CI_PIPELINE',
    script_crash: 'RUNTIME',
    test_failure_retry_exhausted: 'TEST_FAILURE',
    prd_validation_failure: 'QUALITY_GATE',
    state_mismatch: 'RUNTIME'
  };
  return mapping[triggerType] || 'MANUAL';
}

/**
 * Map trigger type to scope type
 */
function mapTriggerToScope(triggerType) {
  const mapping = {
    handoff_failure: 'SD',
    gate_validation_failure: 'SD',
    api_failure: 'RUNTIME',
    migration_failure: 'PIPELINE',
    script_crash: 'RUNTIME',
    test_failure_retry_exhausted: 'PIPELINE',
    prd_validation_failure: 'PRD',
    state_mismatch: 'SD'
  };
  return mapping[triggerType] || 'RUNTIME';
}

/**
 * Determine trigger tier based on event characteristics
 */
function determineTier(triggerEvent) {
  // T1 Critical: handoff failures, API failures with 5xx
  if (triggerEvent.trigger_type === 'handoff_failure') return 2;
  if (triggerEvent.trigger_type === 'api_failure' &&
      triggerEvent.context?.http_status >= 500) return 1;

  // T2 High: gate failures, migration failures
  if (triggerEvent.trigger_type === 'gate_validation_failure') return 2;
  if (triggerEvent.trigger_type === 'migration_failure') return 2;

  // T3 Medium: everything else
  return 3;
}

/**
 * Update or create an issue_patterns entry
 */
async function upsertIssuePattern(supabase, triggerEvent, rcrId, log, resolvedSdId = null) {
  const category = mapClassificationToPatternCategory(triggerEvent.classification);

  // Look for existing pattern with similar fingerprint prefix
  const fingerprintPrefix = triggerEvent.fingerprint.slice(0, 8);
  const { data: existing } = await supabase
    .from('issue_patterns')
    .select('pattern_id, occurrence_count, last_seen_sd_id')
    .ilike('pattern_id', `PAT-AUTO-${fingerprintPrefix}%`)
    .limit(1)
    .maybeSingle();

  if (existing) {
    // Update existing pattern
    const { error } = await supabase
      .from('issue_patterns')
      .update({
        occurrence_count: (existing.occurrence_count || 0) + 1,
        last_seen_sd_id: resolvedSdId || existing.last_seen_sd_id,
        updated_at: new Date().toISOString()
      })
      .eq('pattern_id', existing.pattern_id);

    if (!error) {
      log(`[RCA-Orchestrator] Updated issue pattern: ${existing.pattern_id} (count: ${(existing.occurrence_count || 0) + 1})`);
      return existing.pattern_id;
    }
  }

  // Create new pattern
  const patternId = `PAT-AUTO-${fingerprintPrefix}`;
  const { error } = await supabase
    .from('issue_patterns')
    .insert({
      pattern_id: patternId,
      category,
      severity: determineSeverity(triggerEvent),
      issue_summary: triggerEvent.error_message?.slice(0, 500) || 'Auto-captured issue',
      occurrence_count: 1,
      first_seen_sd_id: resolvedSdId,
      last_seen_sd_id: resolvedSdId,
      source: 'auto_rca',
      status: 'active',
      proven_solutions: [],
      prevention_checklist: [],
      related_sub_agents: ['RCA'],
      trend: 'stable',
      metadata: {
        trigger_type: triggerEvent.trigger_type,
        classification: triggerEvent.classification,
        fingerprint: triggerEvent.fingerprint,
        rcr_id: rcrId,
        auto_captured: true
      }
    });

  if (error) {
    // Pattern might already exist (race condition) - that's OK
    if (error.code === '23505') {
      log(`[RCA-Orchestrator] Issue pattern already exists: ${patternId}`);
      return patternId;
    }
    console.error(`[RCA-Orchestrator] Failed to create issue pattern: ${error.message}`);
    return null;
  }

  log(`[RCA-Orchestrator] Created issue pattern: ${patternId}`);
  return patternId;
}

/**
 * Map SDK classification to issue_patterns category
 */
function mapClassificationToPatternCategory(classification) {
  const mapping = {
    [CLASSIFICATIONS.CODE_BUG]: 'code_quality',
    [CLASSIFICATIONS.PROCESS_ISSUE]: 'process',
    [CLASSIFICATIONS.INFRASTRUCTURE]: 'infrastructure',
    [CLASSIFICATIONS.DATA_QUALITY]: 'data_quality',
    [CLASSIFICATIONS.ENCODING]: 'data_quality',
    [CLASSIFICATIONS.CROSS_CUTTING]: 'architecture',
    [CLASSIFICATIONS.PROTOCOL_PROCESS]: 'process',
    [CLASSIFICATIONS.CONFIGURATION]: 'configuration'
  };
  return mapping[classification] || 'general';
}

/**
 * Determine severity from trigger event
 */
function determineSeverity(triggerEvent) {
  if (triggerEvent.trigger_type === 'handoff_failure') return 'high';
  if (triggerEvent.trigger_type === 'api_failure') return 'medium';
  if (triggerEvent.trigger_type === 'migration_failure') return 'high';
  if (triggerEvent.trigger_type === 'gate_validation_failure') return 'medium';
  return 'low';
}

/**
 * Invoke RCA sub-agent asynchronously
 */
async function invokeRCAAsync(rcrId, log) {
  try {
    const { execute: executeRCA } = await import('../sub-agents/rca.js');
    log(`[RCA-Orchestrator] Invoking RCA sub-agent for RCR ${rcrId}...`);
    await executeRCA(rcrId, { code: 'RCA', name: 'Root Cause Analysis' }, {
      skipLearning: false
    });
    log(`[RCA-Orchestrator] RCA analysis complete for RCR ${rcrId}`);
  } catch (err) {
    console.error(`[RCA-Orchestrator] RCA sub-agent error: ${err.message}`);
  }
}

/**
 * Auto-create a fix SD when recurrence exceeds threshold
 * Gated by RCA_AUTO_CREATE_FIX_SD env var
 */
async function maybeCreateFixSD(supabase, rcrId, triggerEvent, log) {
  // Check if a fix SD already exists for this pattern
  const { data: existingSD } = await supabase
    .from('issue_patterns')
    .select('assigned_sd_id')
    .ilike('pattern_id', `PAT-AUTO-${triggerEvent.fingerprint.slice(0, 8)}%`)
    .not('assigned_sd_id', 'is', null)
    .limit(1)
    .maybeSingle();

  if (existingSD?.assigned_sd_id) {
    log(`[RCA-Orchestrator] Fix SD already exists: ${existingSD.assigned_sd_id}`);
    return;
  }

  log(`[RCA-Orchestrator] Recurrence threshold (${RECURRENCE_THRESHOLD}) reached for RCR ${rcrId}`);
  log(`[RCA-Orchestrator] Auto-create fix SD is ${AUTO_CREATE_FIX_SD ? 'ENABLED' : 'DISABLED'}`);

  if (!AUTO_CREATE_FIX_SD) return;

  // Create a fix SD - minimal implementation, links to pattern
  const sdTitle = `Fix: ${triggerEvent.error_message?.slice(0, 100) || 'Recurring issue'}`;
  const { data: newSD, error } = await supabase
    .from('strategic_directives_v2')
    .insert({
      id: `SD-LEO-FIX-AUTO-${triggerEvent.fingerprint.slice(0, 8).toUpperCase()}`,
      title: sdTitle,
      status: 'draft',
      category: 'quality',
      priority: 'medium',
      sd_type: 'bugfix',
      description: `Auto-generated fix SD for recurring issue (${RECURRENCE_THRESHOLD}+ occurrences in ${RECURRENCE_WINDOW_DAYS} days).\n\nTrigger: ${triggerEvent.trigger_type}\nError: ${triggerEvent.error_message}\nRCR: ${rcrId}`,
      scope: JSON.stringify({
        description: `Fix recurring ${triggerEvent.classification} issue`,
        linked_rcr_id: rcrId,
        linked_fingerprint: triggerEvent.fingerprint
      }),
      target_application: 'EHG_Engineer'
    })
    .select('id')
    .single();

  if (error) {
    console.error(`[RCA-Orchestrator] Failed to auto-create fix SD: ${error.message}`);
    return;
  }

  // Link pattern to SD
  await supabase
    .from('issue_patterns')
    .update({ assigned_sd_id: newSD.id })
    .ilike('pattern_id', `PAT-AUTO-${triggerEvent.fingerprint.slice(0, 8)}%`);

  log(`[RCA-Orchestrator] Auto-created fix SD: ${newSD.id}`);
}

/**
 * Quick non-blocking trigger - for use in catch blocks
 * Logs but doesn't throw on failure
 *
 * @param {Object} triggerEvent - From trigger-sdk buildXxxContext()
 */
export async function triggerQuick(triggerEvent) {
  try {
    await processTriggerEvent(triggerEvent, { skipRCA: true, verbose: false });
  } catch (err) {
    console.error(`[RCA-Orchestrator] Quick trigger failed: ${err.message}`);
  }
}

export default { processTriggerEvent, triggerQuick };
