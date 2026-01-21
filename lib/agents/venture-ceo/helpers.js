/**
 * CEO Runtime Helpers
 * Private helper methods for message operations, memory, and utilities
 *
 * Extracted from venture-ceo-runtime.js for modularity
 * SD-LEO-REFACTOR-VENTURE-CEO-001
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Load agent context and capabilities from database
 * Fetches capabilities and tool_access from agent_registry
 *
 * @param {Object} supabase - Supabase client
 * @param {string} agentId - Agent ID
 * @returns {Promise<Object>} Agent context with capabilities
 */
export async function loadAgentContext(supabase, agentId) {
  const { data, error } = await supabase
    .from('agent_registry')
    .select('*, agent_memory_stores(*)')
    .eq('id', agentId)
    .single();

  if (error) {
    throw new Error(`Failed to load agent context: ${error.message}`);
  }

  console.log(`   Agent: ${data?.display_name}`);
  console.log(`   Venture: ${data?.venture_id}`);
  console.log(`   Capabilities: ${data?.capabilities?.join(', ') || 'none'}`);

  return {
    context: data,
    ventureId: data?.venture_id,
    capabilities: data?.capabilities || [],
    toolAccess: data?.tool_access || {}
  };
}

/**
 * Mark message as completed
 *
 * @param {Object} supabase - Supabase client
 * @param {string} messageId - Message ID
 * @param {Object} result - Processing result
 */
export async function markMessageCompleted(supabase, messageId, result) {
  await supabase
    .from('agent_messages')
    .update({
      status: 'completed',
      metadata: { result_summary: result.status }
    })
    .eq('id', messageId);
}

/**
 * Mark message as failed
 *
 * @param {Object} supabase - Supabase client
 * @param {string} messageId - Message ID
 * @param {string} errorMessage - Error description
 */
export async function markMessageFailed(supabase, messageId, errorMessage) {
  await supabase
    .from('agent_messages')
    .update({
      status: 'failed',
      metadata: { error: errorMessage }
    })
    .eq('id', messageId);
}

/**
 * Send outbound messages
 *
 * @param {Object} supabase - Supabase client
 * @param {string} fromAgentId - Sending agent ID
 * @param {Array} messages - Messages to send
 */
export async function sendOutboundMessages(supabase, fromAgentId, messages) {
  for (const msg of messages) {
    const { error } = await supabase
      .from('agent_messages')
      .insert({
        ...msg,
        from_agent_id: fromAgentId,
        correlation_id: msg.correlation_id || uuidv4(),
        status: 'pending',
        created_at: new Date().toISOString()
      });

    if (error) {
      console.warn(`Warning: Failed to send message: ${error.message}`);
    }
  }
}

/**
 * Update agent memory
 * INDUSTRIAL-HARDENING-v2.9.0: Memory Partitioning
 * All memory operations MUST include venture_id to prevent cross-contamination
 *
 * @param {Object} supabase - Supabase client
 * @param {string} agentId - Agent ID
 * @param {string} ventureId - Venture ID (required)
 * @param {Object} update - Memory update content
 */
export async function updateMemory(supabase, agentId, ventureId, update) {
  // SOVEREIGN SEAL v2.9.0: Enforce venture_id on all memory writes
  if (!ventureId) {
    console.warn('[GOVERNANCE] INDUSTRIAL-v2.9.0: Memory write blocked - no venture_id');
    return;
  }

  await supabase
    .from('agent_memory_stores')
    .insert({
      agent_id: agentId,
      venture_id: ventureId, // INDUSTRIAL-HARDENING-v2.9.0: Memory isolation
      memory_type: update.type,
      content: update.content,
      summary: JSON.stringify(update.content).substring(0, 200),
      version: 1,
      is_current: true,
      importance_score: 0.7
    });
}

/**
 * Handle overdue message
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} msg - Overdue message
 */
export async function handleOverdueMessage(supabase, msg) {
  console.log(`   Handling overdue: ${msg.subject}`);
  // Could escalate or send reminder
  // Implementation depends on business requirements
}

/**
 * Run supervisor timers - deadline watchdog
 *
 * @param {Object} supabase - Supabase client
 */
export async function runSupervisorTimers(supabase) {
  console.log('\nRunning supervisor timers...');

  // Check for overdue messages
  const { data: overdueMessages } = await supabase
    .from('agent_messages')
    .select('id, subject, to_agent_id, response_deadline')
    .eq('status', 'pending')
    .lt('response_deadline', new Date().toISOString())
    .limit(10);

  if (overdueMessages && overdueMessages.length > 0) {
    console.log(`   Warning: Found ${overdueMessages.length} overdue messages`);

    for (const msg of overdueMessages) {
      await handleOverdueMessage(supabase, msg);
    }
  } else {
    console.log('   No overdue messages');
  }
}

/**
 * Get EVA agent
 *
 * @param {Object} supabase - Supabase client
 * @returns {Promise<Object>} EVA agent data
 */
export async function getEvaAgent(supabase) {
  return supabase
    .from('agent_registry')
    .select('id')
    .eq('agent_type', 'eva')
    .single();
}

/**
 * Get venture status
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Object>} Venture status
 */
export async function getVentureStatus(supabase, ventureId) {
  const { data } = await supabase
    .from('ventures')
    .select('id, name, current_lifecycle_stage, status')
    .eq('id', ventureId)
    .single();

  return data || { error: 'Venture not found' };
}

/**
 * Get VP statuses
 *
 * @param {Object} supabase - Supabase client
 * @param {string} ventureId - Venture ID
 * @returns {Promise<Array>} VP statuses
 */
export async function getVpStatuses(supabase, ventureId) {
  const { data } = await supabase
    .from('agent_registry')
    .select('id, agent_role, status, token_consumed')
    .eq('venture_id', ventureId)
    .eq('agent_type', 'executive');

  return data || [];
}

/**
 * Sleep helper
 *
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if agent has required capability
 *
 * @param {Array} capabilities - Agent's authorized capabilities
 * @param {string} requiredCapability - Capability to check
 * @returns {boolean} True if agent has capability
 */
export function hasCapability(capabilities, requiredCapability) {
  return capabilities.includes(requiredCapability) || capabilities.includes('*');
}

/**
 * Validate capability for operation
 *
 * @param {Array} capabilities - Agent's authorized capabilities
 * @param {string} capability - Required capability
 * @param {string} agentId - Agent ID for error message
 * @throws {Error} If capability not authorized
 */
export function validateCapability(capabilities, capability, agentId) {
  if (!hasCapability(capabilities, capability)) {
    throw new Error(`Agent ${agentId} lacks required capability: ${capability}`);
  }
}
