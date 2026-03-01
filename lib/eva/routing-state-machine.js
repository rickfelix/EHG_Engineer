/**
 * Tri-Modal Routing State Machine
 * SD-MAN-INFRA-CORRECTIVE-ARCHITECTURE-GAP-025
 *
 * Implements explicit state transitions between PRIORITY_QUEUE, EVENT_BUS,
 * and ESCALATION routing modes with defined entry/exit conditions.
 *
 * Design principles:
 *   - Stateless: current mode stored in database, not module-level vars
 *   - Constructor injection for Supabase client
 *   - All transitions emit events to eva_event_log
 *   - Invalid transitions throw descriptive errors
 *
 * @module lib/eva/routing-state-machine
 */

import { ServiceError } from './shared-services.js';

export const MODULE_VERSION = '1.0.0';

/**
 * The three routing modes in EVA's tri-modal routing system.
 */
export const ROUTING_MODES = {
  PRIORITY_QUEUE: 'PRIORITY_QUEUE',
  EVENT_BUS: 'EVENT_BUS',
  ESCALATION: 'ESCALATION',
};

/**
 * Valid transitions between routing modes.
 * Key = from_mode, Value = array of allowed to_modes.
 */
const VALID_TRANSITIONS = {
  PRIORITY_QUEUE: ['EVENT_BUS', 'ESCALATION'],
  EVENT_BUS: ['PRIORITY_QUEUE', 'ESCALATION'],
  ESCALATION: ['EVENT_BUS'],
};

/**
 * Entry conditions for each mode (documentation + validation).
 */
const MODE_ENTRY_CONDITIONS = {
  PRIORITY_QUEUE: 'Default mode. Enter when no active escalations and work items should be processed by priority.',
  EVENT_BUS: 'Enter when lifecycle events need broadcast-style distribution to multiple handlers.',
  ESCALATION: 'Enter when DFE triggers L2+ severity or chairman timeout fires. Exit only to EVENT_BUS.',
};

/**
 * Get the current routing mode for a venture from the database.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId - UUID of the venture
 * @returns {Promise<string>} Current routing mode (defaults to PRIORITY_QUEUE)
 */
export async function getCurrentMode(supabase, ventureId) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'RoutingStateMachine');

  const { data, error } = await supabase
    .from('eva_event_log')
    .select('metadata')
    .eq('venture_id', ventureId)
    .eq('event_type', 'ROUTING_MODE_TRANSITION')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ServiceError('QUERY_FAILED', `Failed to query routing mode: ${error.message}`, 'RoutingStateMachine', error);
  }

  return data?.metadata?.to_mode || ROUTING_MODES.PRIORITY_QUEUE;
}

/**
 * Check if a transition is valid.
 *
 * @param {string} fromMode - Current routing mode
 * @param {string} toMode - Requested routing mode
 * @returns {boolean}
 */
export function isValidTransition(fromMode, toMode) {
  const allowed = VALID_TRANSITIONS[fromMode];
  return allowed ? allowed.includes(toMode) : false;
}

/**
 * Transition the routing mode for a venture.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @param {string} params.ventureId - UUID of the venture
 * @param {string} params.toMode - Target routing mode
 * @param {string} params.triggerReason - Why this transition is happening
 * @param {string} [params.triggeredBy] - What triggered the transition (e.g. 'DFE', 'scheduler')
 * @returns {Promise<{fromMode: string, toMode: string, eventId: string}>}
 * @throws {ServiceError} If transition is invalid
 */
export async function transitionMode(supabase, { ventureId, toMode, triggerReason, triggeredBy = 'system' }) {
  if (!supabase) throw new ServiceError('INVALID_ARGS', 'supabase client is required', 'RoutingStateMachine');
  if (!ventureId) throw new ServiceError('INVALID_ARGS', 'ventureId is required', 'RoutingStateMachine');
  if (!toMode) throw new ServiceError('INVALID_ARGS', 'toMode is required', 'RoutingStateMachine');
  if (!ROUTING_MODES[toMode]) throw new ServiceError('INVALID_MODE', `Unknown routing mode: ${toMode}. Valid modes: ${Object.keys(ROUTING_MODES).join(', ')}`, 'RoutingStateMachine');

  const fromMode = await getCurrentMode(supabase, ventureId);

  if (fromMode === toMode) {
    return { fromMode, toMode, eventId: null, noOp: true };
  }

  if (!isValidTransition(fromMode, toMode)) {
    // Log the invalid attempt as a warning
    await logTransitionEvent(supabase, {
      ventureId,
      fromMode,
      toMode,
      triggerReason: `INVALID: ${triggerReason}`,
      triggeredBy,
      isWarning: true,
    });

    throw new ServiceError(
      'INVALID_TRANSITION',
      `Cannot transition from ${fromMode} to ${toMode}. Valid transitions from ${fromMode}: [${VALID_TRANSITIONS[fromMode].join(', ')}]. Entry condition for ${toMode}: ${MODE_ENTRY_CONDITIONS[toMode]}`,
      'RoutingStateMachine'
    );
  }

  const eventId = await logTransitionEvent(supabase, {
    ventureId,
    fromMode,
    toMode,
    triggerReason,
    triggeredBy,
    isWarning: false,
  });

  return { fromMode, toMode, eventId };
}

/**
 * Log a routing mode transition event to eva_event_log.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} params
 * @returns {Promise<string>} Event ID
 */
async function logTransitionEvent(supabase, { ventureId, fromMode, toMode, triggerReason, triggeredBy, isWarning }) {
  const { data, error } = await supabase
    .from('eva_event_log')
    .insert({
      venture_id: ventureId,
      event_type: 'ROUTING_MODE_TRANSITION',
      severity: isWarning ? 'warning' : 'info',
      metadata: {
        from_mode: fromMode,
        to_mode: toMode,
        trigger_reason: triggerReason,
        triggered_by: triggeredBy,
        is_warning: isWarning,
        valid_transitions: VALID_TRANSITIONS[fromMode],
        entry_condition: MODE_ENTRY_CONDITIONS[toMode],
        module_version: MODULE_VERSION,
      },
    })
    .select('id')
    .single();

  if (error) {
    throw new ServiceError('LOG_FAILED', `Failed to log transition event: ${error.message}`, 'RoutingStateMachine', error);
  }

  return data.id;
}

/**
 * Get the transition history for a venture.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} ventureId
 * @param {object} [options]
 * @param {number} [options.limit=20] - Max results
 * @param {string} [options.mode] - Filter by specific mode
 * @returns {Promise<Array>}
 */
export async function getTransitionHistory(supabase, ventureId, { limit = 20, mode = null } = {}) {
  let query = supabase
    .from('eva_event_log')
    .select('id, venture_id, event_type, severity, metadata, created_at')
    .eq('venture_id', ventureId)
    .eq('event_type', 'ROUTING_MODE_TRANSITION')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (mode) {
    query = query.or(`metadata->>from_mode.eq.${mode},metadata->>to_mode.eq.${mode}`);
  }

  const { data, error } = await query;

  if (error) {
    throw new ServiceError('QUERY_FAILED', `Failed to query transition history: ${error.message}`, 'RoutingStateMachine', error);
  }

  return data || [];
}

/**
 * Get valid transitions from a given mode.
 *
 * @param {string} mode - Current routing mode
 * @returns {{ validTransitions: string[], entryCondition: string } | null}
 */
export function getValidTransitions(mode) {
  if (!ROUTING_MODES[mode]) return null;
  return {
    validTransitions: VALID_TRANSITIONS[mode] || [],
    entryCondition: MODE_ENTRY_CONDITIONS[mode],
  };
}
