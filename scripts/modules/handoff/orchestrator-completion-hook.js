/**
 * Orchestrator Completion Hook
 *
 * Triggers when an orchestrator SD completes (all children done).
 * Auto-invokes /learn when AUTO-PROCEED is enabled, then displays queue.
 *
 * Part of SD-LEO-ENH-AUTO-PROCEED-001-03
 *
 * @see docs/discovery/auto-proceed-enhancement-discovery.md D07, D08
 */

import { createClient } from '@supabase/supabase-js';
import { resolveAutoProceed } from './auto-proceed-resolver.js';

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

export default {
  executeOrchestratorCompletionHook,
  generateIdempotencyKey,
  hasHookFired,
  recordHookEvent,
  invokeLearnSkill,
  displayQueue
};
