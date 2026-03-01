/**
 * Chairman Dashboard Scope Audit
 * Part of SD-MAN-ORCH-VISION-HEAL-SCORE-93-001-02-C
 *
 * Validates that the chairman dashboard only exposes governance-appropriate
 * interactions. Chairman is a governance role — no data entry forms,
 * no venture creation, no SD implementation. Only decisions, overrides,
 * preference management, and portfolio oversight.
 *
 * ALLOWED interactions:
 * - View pending decisions and approve/reject
 * - Set preferences and thresholds
 * - View portfolio health metrics
 * - Override blocked SDs with reason
 * - View escalations and audit trail
 *
 * PROHIBITED interactions:
 * - Create ventures or SDs
 * - Edit venture details
 * - Modify implementation code
 * - Direct database mutations (outside decisions)
 */

/**
 * Allowed chairman route patterns.
 * Routes matching these patterns are governance-appropriate.
 */
const ALLOWED_ROUTE_PATTERNS = [
  /^\/chairman\/decisions/,        // Decision queue
  /^\/chairman\/preferences/,      // Preference management
  /^\/chairman\/portfolio/,        // Portfolio overview
  /^\/chairman\/escalations/,      // Escalation queue
  /^\/chairman\/audit/,            // Audit trail
  /^\/chairman\/overrides/,        // Override history
  /^\/chairman\/health/,           // Health dashboard
  /^\/chairman\/notifications/,    // Notification settings
  /^\/chairman\/stakeholder-response/, // V02: Stakeholder response acknowledgment
];

/**
 * Prohibited route patterns that indicate scope creep.
 */
const PROHIBITED_ROUTE_PATTERNS = [
  /^\/chairman\/.*create/,         // No creation forms
  /^\/chairman\/.*edit/,           // No editing forms
  /^\/chairman\/.*new/,            // No new entity forms
  /^\/chairman\/ventures\/.*\/edit/, // No venture editing
  /^\/chairman\/sd\/.*\/implement/,  // No implementation
];

/**
 * Allowed Supabase operations for chairman context.
 */
const ALLOWED_TABLE_OPERATIONS = {
  chairman_decisions: ['select', 'update'],   // Read + approve/reject
  chairman_preferences: ['select', 'insert', 'update', 'delete'], // Full CRUD on preferences
  orchestration_events: ['select'],            // Read-only audit
  eva_vision_scores: ['select'],               // Read-only portfolio health
  strategic_directives_v2: ['select'],         // Read-only SD overview
  ventures: ['select'],                        // Read-only venture list
};

/**
 * Audit a set of routes for chairman dashboard scope compliance.
 *
 * @param {string[]} routes - Route paths to audit
 * @returns {{ passed: boolean, allowed: string[], prohibited: string[], unknown: string[] }}
 */
export function auditDashboardRoutes(routes) {
  const allowed = [];
  const prohibited = [];
  const unknown = [];

  for (const route of routes) {
    const isAllowed = ALLOWED_ROUTE_PATTERNS.some(p => p.test(route));
    const isProhibited = PROHIBITED_ROUTE_PATTERNS.some(p => p.test(route));

    if (isProhibited) {
      prohibited.push(route);
    } else if (isAllowed) {
      allowed.push(route);
    } else {
      unknown.push(route);
    }
  }

  return {
    passed: prohibited.length === 0,
    allowed,
    prohibited,
    unknown,
    summary: prohibited.length === 0
      ? `Scope audit passed: ${allowed.length} governance routes, ${unknown.length} unclassified`
      : `SCOPE VIOLATION: ${prohibited.length} data-entry route(s) found on chairman dashboard`,
  };
}

/**
 * Validate a table operation against chairman scope.
 *
 * @param {string} table - Table name
 * @param {string} operation - 'select' | 'insert' | 'update' | 'delete'
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateTableOperation(table, operation) {
  const allowedOps = ALLOWED_TABLE_OPERATIONS[table];
  if (!allowedOps) {
    return { allowed: false, reason: `Table ${table} not in chairman scope` };
  }
  if (!allowedOps.includes(operation)) {
    return { allowed: false, reason: `Operation ${operation} on ${table} not permitted for chairman` };
  }
  return { allowed: true };
}

/**
 * V02/A07: Validate that a dashboard operation targets an SD within
 * the chairman's governance scope. Prevents dashboard from exposing
 * or modifying SDs outside the chairman's venture context.
 *
 * @param {string} sdId - SD UUID being accessed
 * @param {Object} ventureContext - Chairman's authorized venture scope
 * @param {string[]} ventureContext.ventureIds - Venture IDs the chairman oversees
 * @param {Object} supabase - Supabase client
 * @returns {Promise<{ allowed: boolean, reason?: string }>}
 */
export async function validateSDScopeBoundary(sdId, ventureContext, supabase) {
  if (!sdId || !ventureContext?.ventureIds?.length || !supabase) {
    return { allowed: false, reason: 'Missing sdId, ventureContext, or supabase client' };
  }

  try {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('venture_id')
      .eq('id', sdId)
      .single();

    if (error || !data) {
      return { allowed: false, reason: `SD ${sdId} not found` };
    }

    if (!data.venture_id || !ventureContext.ventureIds.includes(data.venture_id)) {
      return { allowed: false, reason: `SD ${sdId} is outside chairman governance scope` };
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: 'Scope check failed — fail-closed' };
  }
}

/**
 * A07: Validate that a decision type is within the set of governance-appropriate
 * decision types for the chairman dashboard.
 *
 * @param {string} decisionType - Decision type from chairman_decisions
 * @returns {{ allowed: boolean, reason?: string }}
 */
const ALLOWED_DECISION_TYPES = [
  'dfe_escalation',
  'gate_review',
  'override_request',
  'budget_override',
  'stakeholder_response',
  'guardrail_override',
  'cascade_override',
];

export function validateDecisionType(decisionType) {
  if (!decisionType) {
    return { allowed: false, reason: 'No decision type provided' };
  }
  if (!ALLOWED_DECISION_TYPES.includes(decisionType)) {
    return { allowed: false, reason: `Decision type '${decisionType}' not in chairman governance scope` };
  }
  return { allowed: true };
}

export {
  ALLOWED_ROUTE_PATTERNS,
  PROHIBITED_ROUTE_PATTERNS,
  ALLOWED_TABLE_OPERATIONS,
  ALLOWED_DECISION_TYPES,
};
