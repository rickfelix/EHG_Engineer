/**
 * Orchestrator Completion Hook
 *
 * Triggers when an orchestrator SD completes (all children done).
 * Auto-invokes /learn when AUTO-PROCEED is enabled, then displays queue.
 * Generates detailed session summary on completion.
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-03, SD-LEO-ENH-AUTO-PROCEED-001-08
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md D07, D08, D17
 */

import { createClient } from '@supabase/supabase-js';
import { resolveAutoProceed, getChainOrchestrators } from './auto-proceed-resolver.js';
import { clearState as clearAutoProceedState } from './auto-proceed-state.js';
import { generateAndEmitSummary, createCollector } from '../session-summary/index.js';

/**
 * Generate a unique idempotency key for orchestrator completion
 * @param {string} orchestratorId - Orchestrator SD ID
 * @returns {string} Idempotency key
 */
export function generateIdempotencyKey(orchestratorId) {
  return `orch-completion-${orchestratorId}-${Date.now()}`;
}

/**
 * Check if hook has already fired for this orchestrator (idempotency check)
 * @param {object} supabase - Supabase client
 * @param {string} orchestratorId - Orchestrator SD ID
 * @returns {Promise<boolean>} True if hook already fired
 */
export async function hasHookFired(supabase, orchestratorId) {
  try {
    const { data, error } = await supabase
      .from('system_events')
      .select('id')
      .eq('event_type', 'ORCHESTRATOR_COMPLETION_HOOK')
      .eq('entity_id', orchestratorId)
      .limit(1);

    if (error) {
      console.warn(`   ⚠️  Could not check hook status: ${error.message}`);
      return false; // Fail open - allow hook to fire
    }

    return data && data.length > 0;
  } catch (err) {
    console.warn(`   ⚠️  Hook check error: ${err.message}`);
    return false;
  }
}

/**
 * Record hook event for idempotency and traceability
 * @param {object} supabase - Supabase client
 * @param {string} orchestratorId - Orchestrator SD ID
 * @param {string} correlationId - Correlation ID for tracing
 * @param {object} details - Additional event details
 * @returns {Promise<boolean>} Success status
 */
export async function recordHookEvent(supabase, orchestratorId, correlationId, details = {}) {
  try {
    const { error } = await supabase
      .from('system_events')
      .insert({
        event_type: 'ORCHESTRATOR_COMPLETION_HOOK',
        entity_type: 'strategic_directive',
        entity_id: orchestratorId,
        details: {
          correlation_id: correlationId,
          auto_proceed: details.autoProceed || false,
          learn_invoked: details.learnInvoked || false,
          queue_displayed: details.queueDisplayed || false,
          child_count: details.childCount || 0,
          timestamp: new Date().toISOString(),
          ...details
        },
        severity: 'info',
        created_by: 'ORCHESTRATOR_COMPLETION_HOOK'
      });

    if (error) {
      console.warn(`   ⚠️  Could not record hook event: ${error.message}`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`   ⚠️  Hook event recording error: ${err.message}`);
    return false;
  }
}

/**
 * Invoke /learn skill programmatically
 * @param {object} supabase - Supabase client
 * @param {string} orchestratorId - Orchestrator SD ID
 * @param {string} correlationId - Correlation ID for tracing
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function invokeLearnSkill(supabase, orchestratorId, correlationId) {
  console.log('\n   📚 AUTO-PROCEED: Invoking /learn for orchestrator completion...');

  try {
    // Record the /learn invocation attempt
    await supabase
      .from('system_events')
      .insert({
        event_type: 'LEARN_SKILL_INVOKED',
        entity_type: 'strategic_directive',
        entity_id: orchestratorId,
        details: {
          correlation_id: correlationId,
          trigger: 'orchestrator_completion_hook',
          timestamp: new Date().toISOString()
        },
        severity: 'info',
        created_by: 'ORCHESTRATOR_COMPLETION_HOOK'
      });

    // Note: The actual /learn skill execution happens in the CLI context
    // Here we signal that /learn should be invoked
    console.log('   ✅ /learn invocation signaled');
    console.log(`   🔗 Correlation ID: ${correlationId}`);

    return { success: true, message: 'Learn skill invocation signaled' };
  } catch (err) {
    console.warn(`   ⚠️  Learn invocation error: ${err.message}`);
    return { success: false, message: err.message };
  }
}

/**
 * Find next available orchestrator in queue for chaining
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-05 (Configurable Orchestrator Chaining)
 *
 * @param {object} supabase - Supabase client
 * @param {string} excludeOrchestratorId - Current orchestrator to exclude
 * @returns {Promise<{ orchestrator: object | null, reason: string }>}
 */
export async function findNextAvailableOrchestrator(supabase, excludeOrchestratorId = null) {
  try {
    let query = supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, parent_sd_id')
      .in('status', ['draft', 'in_progress', 'planning', 'active'])
      .is('parent_sd_id', null) // Only top-level SDs (orchestrators)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(5);

    if (excludeOrchestratorId) {
      query = query.neq('id', excludeOrchestratorId);
    }

    const { data, error } = await query;

    if (error) {
      console.warn(`   ⚠️  findNextOrchestrator error: ${error.message}`);
      return { orchestrator: null, reason: `Query error: ${error.message}` };
    }

    if (!data || data.length === 0) {
      return { orchestrator: null, reason: 'No orchestrators in queue' };
    }

    return { orchestrator: data[0], reason: 'Next orchestrator found' };
  } catch (err) {
    console.warn(`   ⚠️  findNextOrchestrator exception: ${err.message}`);
    return { orchestrator: null, reason: `Exception: ${err.message}` };
  }
}

/**
 * Generate session summary for orchestrator completion
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-08
 *
 * @param {object} supabase - Supabase client
 * @param {string} orchestratorId - Orchestrator SD ID
 * @param {string} correlationId - Correlation ID for tracing
 * @param {string} sessionStatus - Overall session status (SUCCESS, FAILED, CANCELLED)
 * @returns {Promise<{ json: object, digest: string, generation_time_ms: number } | null>}
 */
export async function generateSessionSummary(supabase, orchestratorId, correlationId, sessionStatus = 'SUCCESS') {
  console.log('\n   📊 Generating session summary...');

  try {
    // Create collector with session ID from correlation
    const sessionId = correlationId || `session-${orchestratorId}-${Date.now()}`;
    const collector = createCollector(sessionId, {
      orchestratorVersion: process.env.LEO_VERSION || '4.3.3'
    });

    // Fetch all children SDs for this orchestrator
    const { data: children, error: childError } = await supabase
      .from('strategic_directives_v2')
      .select('id, sd_key, title, status, priority, category, created_at, updated_at, current_phase')
      .eq('parent_sd_id', orchestratorId)
      .order('created_at', { ascending: true });

    if (childError) {
      console.warn(`   ⚠️  Could not fetch children: ${childError.message}`);
      collector.recordIssue('WARN', 'CHILDREN_FETCH_FAILED', `Could not fetch orchestrator children: ${childError.message}`);
    } else if (children && children.length > 0) {
      // Populate collector with SD data
      for (const child of children) {
        // Record as queued
        collector.recordSdQueued(child.id, {
          title: child.title,
          category: child.category,
          priority: child.priority
        });

        // If it has start timestamp, mark as started
        if (child.created_at) {
          collector.recordSdStarted(child.id);
        }

        // Map status to terminal status
        const statusMap = {
          completed: 'SUCCESS',
          done: 'SUCCESS',
          active: 'IN_PROGRESS',
          in_progress: 'IN_PROGRESS',
          failed: 'FAILED',
          blocked: 'FAILED',
          skipped: 'SKIPPED',
          cancelled: 'CANCELLED',
          draft: 'NOT_STARTED',
          planning: 'IN_PROGRESS'
        };

        const terminalStatus = statusMap[child.status?.toLowerCase()] || 'IN_PROGRESS';

        // If terminal, record it
        if (['SUCCESS', 'FAILED', 'SKIPPED', 'CANCELLED'].includes(terminalStatus)) {
          collector.recordSdTerminal(child.id, terminalStatus);
        }
      }
    }

    // Fetch any issues/failures for this orchestrator's session
    const { data: issues, error: issueError } = await supabase
      .from('system_events')
      .select('*')
      .eq('entity_id', orchestratorId)
      .in('severity', ['error', 'warning'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (!issueError && issues) {
      for (const issue of issues) {
        collector.recordIssue(
          issue.severity?.toUpperCase() === 'ERROR' ? 'ERROR' : 'WARN',
          issue.event_type || 'SYSTEM_EVENT',
          issue.details?.message || issue.event_type,
          {
            correlation_ids: issue.details?.correlation_id ? [issue.details.correlation_id] : []
          }
        );
      }
    }

    // Generate and emit summary
    const result = await generateAndEmitSummary(collector, {
      emitLog: true,
      emitDigest: true,
      persistArtifact: false
    });

    // Record summary generation event
    await supabase
      .from('system_events')
      .insert({
        event_type: 'SESSION_SUMMARY_GENERATED',
        entity_type: 'strategic_directive',
        entity_id: orchestratorId,
        details: {
          correlation_id: correlationId,
          session_id: sessionId,
          overall_status: result.json.overall_status,
          total_sds: result.json.total_sds,
          issues_count: result.json.issues.length,
          generation_time_ms: result.generation_time_ms,
          degraded: result.degraded,
          schema_version: result.json.schema_version,
          timestamp: new Date().toISOString()
        },
        severity: 'info',
        created_by: 'ORCHESTRATOR_COMPLETION_HOOK'
      })
      .catch(err => console.warn(`   ⚠️  Could not record summary event: ${err.message}`));

    return result;
  } catch (err) {
    console.warn(`   ⚠️  Session summary generation failed: ${err.message}`);
    return null;
  }
}

/**
 * Display the full SD queue after orchestrator completion
 * @param {object} supabase - Supabase client
 * @param {number} limit - Maximum items to display (default: 200)
 * @returns {Promise<void>}
 */
export async function displayQueue(supabase, limit = 200) {
  console.log('\n   📋 AUTO-PROCEED: Displaying SD queue...');
  console.log('   ' + '─'.repeat(60));

  try {
    const { data: queue, error } = await supabase
      .from('strategic_directives_v2')
      .select('id, title, status, priority, current_phase, parent_sd_id')
      .in('status', ['draft', 'in_progress', 'planning', 'active', 'pending_approval'])
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.log(`   ⚠️  Queue fetch error: ${error.message}`);
      return;
    }

    if (!queue || queue.length === 0) {
      console.log('   ✅ Queue is empty - no pending SDs');
      return;
    }

    // Group by status
    const byStatus = {};
    queue.forEach(sd => {
      const status = sd.status || 'unknown';
      if (!byStatus[status]) byStatus[status] = [];
      byStatus[status].push(sd);
    });

    console.log(`   Total: ${queue.length} SD(s) in queue\n`);

    Object.entries(byStatus).forEach(([status, sds]) => {
      console.log(`   [${status.toUpperCase()}] (${sds.length})`);
      sds.slice(0, 10).forEach(sd => {
        const isChild = sd.parent_sd_id ? '  └─' : '  •';
        const phase = sd.current_phase ? ` (${sd.current_phase})` : '';
        console.log(`   ${isChild} ${sd.id}: ${sd.title?.slice(0, 40)}${phase}`);
      });
      if (sds.length > 10) {
        console.log(`      ... and ${sds.length - 10} more`);
      }
      console.log('');
    });

    console.log('   ' + '─'.repeat(60));
    console.log('   💡 Run: npm run sd:next for detailed recommendations');
  } catch (err) {
    console.log(`   ⚠️  Queue display error: ${err.message}`);
  }
}

/**
 * Main orchestrator completion hook
 *
 * Called when an orchestrator SD completes (all children done).
 * When AUTO-PROCEED is enabled:
 * 1. Records hook event (idempotent)
 * 2. Invokes /learn skill
 * 3. Displays full queue
 *
 * @param {string} orchestratorId - Orchestrator SD ID
 * @param {string} orchestratorTitle - Orchestrator title
 * @param {number} childCount - Number of completed children
 * @param {object} options - Hook options
 * @param {object} options.supabase - Supabase client (optional)
 * @returns {Promise<{ fired: boolean, autoProceed: boolean, correlationId: string }>}
 */
export async function executeOrchestratorCompletionHook(
  orchestratorId,
  orchestratorTitle,
  childCount,
  options = {}
) {
  console.log('\n🎉 ORCHESTRATOR COMPLETION HOOK');
  console.log('═'.repeat(60));
  console.log(`   Orchestrator: ${orchestratorId}`);
  console.log(`   Title: ${orchestratorTitle}`);
  console.log(`   Children Completed: ${childCount}`);

  // Get or create Supabase client
  const supabase = options.supabase || createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Generate correlation ID for tracing
  const correlationId = `orch-${orchestratorId}-${Date.now()}`;

  // Idempotency check
  const alreadyFired = await hasHookFired(supabase, orchestratorId);
  if (alreadyFired) {
    console.log('   ℹ️  Hook already fired for this orchestrator (idempotent skip)');
    return { fired: false, autoProceed: false, correlationId };
  }

  // Resolve AUTO-PROCEED mode
  const autoProceedResult = await resolveAutoProceed({
    supabase,
    verbose: false
  });

  const hookDetails = {
    autoProceed: autoProceedResult.autoProceed,
    childCount,
    correlationId,
    learnInvoked: false,
    queueDisplayed: false
  };

  if (autoProceedResult.autoProceed) {
    console.log('   ✅ AUTO-PROCEED: ENABLED');

    // Invoke /learn
    const learnResult = await invokeLearnSkill(supabase, orchestratorId, correlationId);
    hookDetails.learnInvoked = learnResult.success;

    // Display queue
    await displayQueue(supabase);
    hookDetails.queueDisplayed = true;

    // Check for orchestrator chaining (SD-LEO-ENH-AUTO-PROCEED-001-05)
    const chainingResult = await getChainOrchestrators(supabase);
    hookDetails.chainOrchestratorsEnabled = chainingResult.chainOrchestrators;

    if (chainingResult.chainOrchestrators) {
      // Find next available orchestrator
      const { orchestrator: nextOrchestrator, reason } = await findNextAvailableOrchestrator(supabase, orchestratorId);

      if (nextOrchestrator) {
        console.log(`\n   🔗 ORCHESTRATOR CHAINING: Auto-continuing to ${nextOrchestrator.sd_key}`);
        console.log(`   📍 Next: ${nextOrchestrator.title}`);

        // Record the chaining decision
        hookDetails.chainedToOrchestrator = nextOrchestrator.id;
        hookDetails.chainedToSdKey = nextOrchestrator.sd_key;

        // Record hook event before returning
        await recordHookEvent(supabase, orchestratorId, correlationId, hookDetails);

        // Emit telemetry event for chaining
        await emitChainingTelemetry(supabase, orchestratorId, nextOrchestrator.id, 'chain', correlationId);

        console.log('═'.repeat(60));

        return {
          fired: true,
          autoProceed: true,
          chainContinue: true,
          nextOrchestrator: nextOrchestrator.id,
          nextOrchestratorSdKey: nextOrchestrator.sd_key,
          correlationId
        };
      } else {
        console.log('\n   🔗 ORCHESTRATOR CHAINING: No next orchestrator available');
        console.log(`   📍 Reason: ${reason}`);

        // Emit telemetry for no-chain decision
        await emitChainingTelemetry(supabase, orchestratorId, null, 'pause_no_orchestrator', correlationId);
      }
    } else {
      // Emit telemetry for pause decision (chaining disabled)
      await emitChainingTelemetry(supabase, orchestratorId, null, 'pause_disabled', correlationId);
    }

    // Clear AUTO-PROCEED state now that orchestrator is complete (and not chaining)
    try {
      clearAutoProceedState(true); // Keep resume count history
      console.log('   ✅ AUTO-PROCEED state cleared (orchestrator complete)');
    } catch (apErr) {
      console.warn(`   ⚠️  Could not clear AUTO-PROCEED state: ${apErr.message}`);
    }

    console.log('\n   ⏸️  PAUSE POINT: Orchestrator complete');
    console.log('   💡 Review learnings and select next work from queue');
  } else {
    console.log('   ℹ️  AUTO-PROCEED: DISABLED');
    console.log('   💡 Run /learn manually to capture patterns');
    console.log('   💡 Run npm run sd:next to see the queue');
  }

  // Record hook event (idempotency marker)
  await recordHookEvent(supabase, orchestratorId, correlationId, hookDetails);

  console.log('═'.repeat(60));

  return {
    fired: true,
    autoProceed: autoProceedResult.autoProceed,
    correlationId
  };
}

/**
 * Emit structured telemetry event for chaining decisions
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-05 (US-005)
 *
 * @param {object} supabase - Supabase client
 * @param {string} orchestratorId - Current orchestrator ID
 * @param {string|null} nextOrchestratorId - Next orchestrator ID (null if not chaining)
 * @param {string} decision - Decision type: 'chain', 'pause_disabled', 'pause_no_orchestrator', 'stop_on_error'
 * @param {string} correlationId - Correlation ID for tracing
 * @returns {Promise<boolean>} Success status
 */
export async function emitChainingTelemetry(supabase, orchestratorId, nextOrchestratorId, decision, correlationId) {
  try {
    const { error } = await supabase
      .from('system_events')
      .insert({
        event_type: 'ORCHESTRATOR_CHAINING_DECISION',
        entity_type: 'strategic_directive',
        entity_id: orchestratorId,
        details: {
          correlation_id: correlationId,
          decision,
          next_orchestrator_id: nextOrchestratorId,
          timestamp: new Date().toISOString(),
          telemetry_version: '1.0.0'
        },
        severity: decision === 'stop_on_error' ? 'warning' : 'info',
        created_by: 'ORCHESTRATOR_COMPLETION_HOOK'
      });

    if (error) {
      console.warn(`   ⚠️  Chaining telemetry error: ${error.message}`);
      return false;
    }

    return true;
  } catch (err) {
    console.warn(`   ⚠️  Chaining telemetry exception: ${err.message}`);
    return false;
  }
}

export default {
  executeOrchestratorCompletionHook,
  generateIdempotencyKey,
  hasHookFired,
  recordHookEvent,
  invokeLearnSkill,
  displayQueue,
  findNextAvailableOrchestrator,
  emitChainingTelemetry
};
