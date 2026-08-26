/**
 * Validate Stage 19 LLM output against EHG_VENTURE_DEFAULT_CAPABILITIES.
 *
 * Belt-and-suspenders enforcement layer #2: catches deviation independent of
 * the prompt-text constraint. LLMs frequently ignore single-channel constraints,
 * so this post-parse check ensures a sprint plan missing a mandatory capability
 * is rejected even if the SYSTEM_PROMPT instruction was disregarded.
 *
 * Override hatch: `defaultCapabilitiesOverride[<capability_id>].override_reason`
 * (non-empty trimmed string) permits intentional omission for legitimate cases
 * (B2B-only ventures, sub-15-pt sprints). Empty / null / whitespace-only
 * `override_reason` is FAIL-CLOSED — accidental or buggy overrides do NOT
 * bypass the gate.
 *
 * SD-LEO-ENH-CONSTRAIN-STAGE-EMIT-001
 * Sibling pattern: lib/eva/utils/validate-house-stack-adherence.js
 *
 * @module lib/eva/utils/validate-venture-default-capabilities
 */

import { EHG_VENTURE_DEFAULT_CAPABILITIES } from '../config/venture-default-capabilities.js';

/**
 * Match a capability against any sprint item by title-prefix or capability_id substring,
 * case-insensitive. Permissive matching tolerates LLM rephrasings of the canonical name.
 *
 * @param {Object} capability - One EHG_VENTURE_DEFAULT_CAPABILITIES entry
 * @param {Array} sprintItems - parsedSprintPlan.sprintItems (post-normalization)
 * @returns {boolean} true if any sprint item resembles this capability
 */
function isCapabilityPresent(capability, sprintItems) {
  if (!Array.isArray(sprintItems)) return false;
  const nameLower = String(capability.name || '').toLowerCase();
  const idLower = String(capability.capability_id || '').toLowerCase();
  for (const item of sprintItems) {
    const title = String(item?.title || '').toLowerCase();
    if (title && (title.startsWith(nameLower) || title.includes(idLower) || nameLower.split(' ').slice(-2).every(w => title.includes(w)))) {
      return true;
    }
  }
  return false;
}

/**
 * Validate the parsed Stage 19 sprint plan against EHG_VENTURE_DEFAULT_CAPABILITIES.
 *
 * @param {Object} parsedSprintPlan - Parsed Stage 19 LLM output (post-normalization)
 * @param {Object} [opts]
 * @param {Object} [opts.defaultCapabilitiesOverride={}] - { [capability_id]: { override_reason: string } }
 * @returns {{ valid: boolean, errors: string[], warnings: string[] }}
 */
export function validateVentureDefaultCapabilities(parsedSprintPlan, opts = {}) {
  const errors = [];
  const warnings = [];

  if (!parsedSprintPlan || typeof parsedSprintPlan !== 'object') {
    return { valid: false, errors: ['Parsed sprint plan is null or not an object'], warnings: [] };
  }

  const sprintItems = Array.isArray(parsedSprintPlan.sprintItems)
    ? parsedSprintPlan.sprintItems
    : (Array.isArray(parsedSprintPlan.items) ? parsedSprintPlan.items : []);

  const overrideMap = (opts.defaultCapabilitiesOverride && typeof opts.defaultCapabilitiesOverride === 'object')
    ? opts.defaultCapabilitiesOverride
    : {};

  for (const capability of EHG_VENTURE_DEFAULT_CAPABILITIES) {
    if (isCapabilityPresent(capability, sprintItems)) {
      continue;
    }

    // Capability missing — check override
    const override = overrideMap[capability.capability_id];
    const overrideReasonRaw = override?.override_reason;
    const overrideReason = typeof overrideReasonRaw === 'string' ? overrideReasonRaw.trim() : '';

    if (override === undefined) {
      errors.push(`Missing mandatory capability: ${capability.capability_id} — no override_reason provided`);
      continue;
    }

    if (!overrideReason) {
      // FAIL CLOSED — null/undefined/empty/whitespace-only override_reason is malformed override
      errors.push(`Missing mandatory capability: ${capability.capability_id} — override_reason is empty or malformed`);
      continue;
    }

    warnings.push(`Capability ${capability.capability_id} intentionally omitted: ${overrideReason}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Typed error thrown by analyzeStage19 when validation fails without an
 * authorized override. Distinguishes constraint-violation failures from
 * transient LLM errors so callers can route remediation appropriately.
 */
export class MissingDefaultCapabilityError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'MissingDefaultCapabilityError';
    this.code = 'MISSING_DEFAULT_CAPABILITY';
    this.errors = errors;
  }
}

// SD-LEO-INFRA-UNIVERSAL-VENTURE-TELEMETRY-001 (FR-5): capability_id -> the
// feedback.feedback_type values that prove the capability is actually WIRED
// (a live row exists), as opposed to merely DECLARED in a Stage-19 sprint plan.
// Only the two capabilities this SD wires have a DB-verifiable signal; the
// other portfolio-default capabilities have no such signal yet and are not
// covered by verifyCapabilityWired.
export const WIRED_CAPABILITY_FEEDBACK_TYPES = Object.freeze({
  'feedback-widget': Object.freeze(['user_bug', 'user_feature_request', 'user_usability', 'user_other']),
  'error-capture-middleware': Object.freeze(['venture_error']),
});

// SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C: telemetry-analytics's ground-truth signal
// lives in venture_usage_events (a table, not the feedback table WIRED_CAPABILITY_FEEDBACK_TYPES
// is shaped for), so it is verified via a dedicated RPC call rather than a registry entry.
// Default trailing window for the RPC's required p_window_start/p_window_end args.
const TELEMETRY_ANALYTICS_DEFAULT_WINDOW_DAYS = 30;

/**
 * Belt-and-suspenders enforcement layer #3: validateVentureDefaultCapabilities()
 * (above) only checks that a Stage-19 sprint plan DECLARES a mandatory capability
 * as a sprint item — an LLM can declare it, ship a local-only stub, and still pass.
 * This checks the ground truth: does a live row actually exist for this venture,
 * proving the capability is wired to the EHG inbox, not just claimed.
 *
 * @param {Object} supabase - Supabase client (anon or service-role) scoped to EHG_Engineer
 * @param {string} ventureId - ventures.id to check
 * @param {string} capabilityId - one of WIRED_CAPABILITY_FEEDBACK_TYPES' keys
 * @returns {Promise<{ wired: boolean, reason: string }>}
 */
export async function verifyCapabilityWired(supabase, ventureId, capabilityId) {
  if (!ventureId) {
    return { wired: false, reason: 'ventureId is required' };
  }

  // MUST be checked before the WIRED_CAPABILITY_FEEDBACK_TYPES lookup below --
  // 'telemetry-analytics' is not a feedback-table-shaped capability and would
  // otherwise be swallowed by the early "no wired-verification signal" return.
  if (capabilityId === 'telemetry-analytics') {
    return verifyTelemetryAnalyticsWired(supabase, ventureId);
  }

  const feedbackTypes = WIRED_CAPABILITY_FEEDBACK_TYPES[capabilityId];
  if (!feedbackTypes) {
    return { wired: false, reason: `capability_id ${capabilityId} has no wired-verification signal` };
  }

  const { data, error } = await supabase
    .from('feedback')
    .select('id')
    .eq('venture_id', ventureId)
    .in('feedback_type', feedbackTypes)
    .limit(1);

  if (error) {
    return { wired: false, reason: `query failed: ${error.message}` };
  }

  return (data?.length ?? 0) > 0
    ? { wired: true, reason: `found a ${feedbackTypes.join('/')} row for this venture` }
    : { wired: false, reason: `no ${feedbackTypes.join('/')} row exists for this venture yet` };
}

/**
 * SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-C (FR-3): ground-truth check for telemetry-analytics.
 * Calls fn_venture_usage_window_summary (a SECURITY DEFINER RPC over venture_usage_events,
 * see SD-LEO-GEN-ALL-VENTURES-PRODUCED-001-A) rather than a direct table SELECT, so RLS
 * deny-by-default on venture_usage_events cannot produce a false negative here.
 *
 * wired=true iff event_count > 0.
 *
 * CORRECTED (post-EXEC, against Child A's actual shipped schema -- PR #7563): venture_usage_events
 * has no actor_hash or any user-identifier column (Child A's own RISK sub-agent deliberately
 * excluded user identifiers to avoid a silently-broken GDPR/erasure-cascade boundary on this
 * shared, cross-venture table), so active-user counting is not derivable. This function reports
 * event_count only.
 *
 * @param {Object} supabase - Supabase client with EXECUTE on fn_venture_usage_window_summary
 *   (service_role only -- this RPC is not anon/authenticated-callable, see PRD FR-2)
 * @param {string} ventureId - ventures.id to check
 * @returns {Promise<{ wired: boolean, reason: string }>}
 */
async function verifyTelemetryAnalyticsWired(supabase, ventureId) {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - TELEMETRY_ANALYTICS_DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await supabase.rpc('fn_venture_usage_window_summary', {
    p_venture_id: ventureId,
    p_window_start: windowStart.toISOString(),
    p_window_end: windowEnd.toISOString(),
  });

  if (error) {
    return { wired: false, reason: `fn_venture_usage_window_summary call failed: ${error.message}` };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const eventCount = row?.event_count ?? 0;

  return eventCount > 0
    ? { wired: true, reason: `${eventCount} usage event(s) in the last ${TELEMETRY_ANALYTICS_DEFAULT_WINDOW_DAYS} days` }
    : { wired: false, reason: `no usage events in the last ${TELEMETRY_ANALYTICS_DEFAULT_WINDOW_DAYS} days` };
}
