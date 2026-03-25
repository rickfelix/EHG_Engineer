/**
 * Venture Session Routing — Assigns sessions to ventures for context preservation
 *
 * Tracks session-to-venture assignments in claude_sessions.metadata.venture_assignment.
 * When a session claims an SD that belongs to a venture orchestrator, the venture
 * name is recorded so subsequent SD picks prioritize the same venture.
 *
 * Created by: SD-LEO-INFRA-VENTURE-LEO-BUILD-001-L
 *
 * @module lib/eva/bridge/venture-session-routing
 */

/**
 * Detect venture context from an SD record.
 *
 * @param {Object} sd - Strategic directive record
 * @returns {{ ventureName: string|null, orchestratorKey: string|null }}
 */
export function detectVentureContext(sd) {
  // Check metadata for vision_key (indicates orchestrator or child of orchestrator)
  const visionKey = sd.metadata?.vision_key;
  const parentKey = sd.metadata?.parent_key || sd.parent_sd_id;

  if (!visionKey && !parentKey) {
    return { ventureName: null, orchestratorKey: null };
  }

  // Extract venture name from vision_key pattern: VISION-<NAME>-L2-001
  if (visionKey) {
    const match = visionKey.match(/^VISION-(.+?)-L\d+-\d+$/);
    if (match) {
      return {
        ventureName: match[1].toLowerCase().replace(/-/g, ' '),
        orchestratorKey: parentKey || sd.sd_key,
      };
    }
  }

  return {
    ventureName: parentKey ? `orchestrator:${parentKey}` : null,
    orchestratorKey: parentKey || null,
  };
}

/**
 * Set venture assignment on a session.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sessionId - Session ID
 * @param {string} ventureName - Venture name to assign
 * @returns {Promise<boolean>} Success
 */
export async function setVentureAssignment(supabase, sessionId, ventureName) {
  const { data: session } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .single();

  const metadata = { ...(session?.metadata || {}), venture_assignment: ventureName };

  const { error } = await supabase
    .from('claude_sessions')
    .update({ metadata })
    .eq('session_id', sessionId);

  return !error;
}

/**
 * Clear venture assignment from a session.
 *
 * @param {Object} supabase - Supabase client
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>} Success
 */
export async function clearVentureAssignment(supabase, sessionId) {
  const { data: session } = await supabase
    .from('claude_sessions')
    .select('metadata')
    .eq('session_id', sessionId)
    .single();

  const metadata = { ...(session?.metadata || {}) };
  delete metadata.venture_assignment;

  const { error } = await supabase
    .from('claude_sessions')
    .update({ metadata })
    .eq('session_id', sessionId);

  return !error;
}

/**
 * Check if a venture sprint is complete (all children done or blocked).
 *
 * @param {Object} supabase - Supabase client
 * @param {string} orchestratorKey - Parent SD key
 * @returns {Promise<{ complete: boolean, total: number, completed: number, blocked: number, remaining: number }>}
 */
export async function checkVentureSprintStatus(supabase, orchestratorKey) {
  const { data: parent } = await supabase
    .from('strategic_directives_v2')
    .select('id')
    .eq('sd_key', orchestratorKey)
    .single();

  if (!parent) return { complete: false, total: 0, completed: 0, blocked: 0, remaining: 0 };

  const { data: children } = await supabase
    .from('strategic_directives_v2')
    .select('status')
    .eq('parent_sd_id', parent.id);

  const total = children?.length || 0;
  const completed = children?.filter(c => c.status === 'completed').length || 0;
  const blocked = children?.filter(c => c.status === 'blocked').length || 0;
  const remaining = total - completed - blocked;

  return {
    complete: remaining === 0,
    total,
    completed,
    blocked,
    remaining,
  };
}

/**
 * Group SDs by venture context for display.
 *
 * @param {Array} sds - Array of SD records
 * @returns {Map<string, Array>} Map of venture label -> SDs
 */
export function groupByVenture(sds) {
  const groups = new Map();
  const ungrouped = [];

  for (const sd of sds) {
    const { ventureName } = detectVentureContext(sd);
    if (ventureName) {
      if (!groups.has(ventureName)) groups.set(ventureName, []);
      groups.get(ventureName).push(sd);
    } else {
      ungrouped.push(sd);
    }
  }

  // Add ungrouped SDs under a special key
  if (ungrouped.length > 0) {
    groups.set('_standalone', ungrouped);
  }

  return groups;
}
