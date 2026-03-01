/**
 * Guardrail Enforcement Engine — Advisory-to-Blocking Transformation
 * SD: SD-MAN-ORCH-VISION-HEAL-SCORE-93-002-03-C
 *
 * Wraps guardrail-registry.js to enforce blocking mode on advisory
 * guardrails. Manages override requests via chairman_decisions table
 * with full audit trail.
 *
 * @module lib/eva/guardrail-enforcement-engine
 */

const ENFORCEMENT_MODES = Object.freeze({
  ADVISORY: 'advisory',
  BLOCKING: 'blocking',
  DISABLED: 'disabled',
});

const DEFAULT_ENFORCEMENT_POLICY = Object.freeze({
  'GR-VISION-ALIGNMENT': 'blocking',
  'GR-SCOPE-BOUNDARY': 'blocking',
  'GR-GOVERNANCE-CASCADE': 'blocking',
  'GR-RISK-ASSESSMENT': 'blocking',      // Upgraded from advisory
  'GR-CORRECTIVE-EXEMPT': 'advisory',    // Exemption stays advisory
  'GR-BULK-SD-BLOCK': 'blocking',
  'GR-ORCHESTRATOR-ARCH-PLAN': 'blocking',
  'GR-BRAINSTORM-INTENT': 'blocking',    // Upgraded from advisory
  'GR-OKR-HARD-STOP': 'blocking',
});

/**
 * Enforce a guardrail check with blocking/advisory mode.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.guardrailId - Guardrail identifier (e.g., 'GR-RISK-ASSESSMENT')
 * @param {Object} params.checkResult - Result from guardrail-registry.js check()
 * @param {string} params.sdId - SD UUID being checked
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {Object} [options.policyOverrides] - Per-guardrail mode overrides
 * @returns {Promise<{ enforced: boolean, blocked: boolean, mode: string, overrideAvailable: boolean, error?: string }>}
 */
export async function enforceGuardrail(supabase, params, options = {}) {
  const { logger = console, policyOverrides = {} } = options;
  const { guardrailId, checkResult, sdId } = params;

  if (!guardrailId || !checkResult) {
    return { enforced: false, blocked: false, mode: 'unknown', overrideAvailable: false, error: 'Missing required params' };
  }

  const mode = getEffectiveMode(guardrailId, policyOverrides);

  // If guardrail passed, no enforcement needed
  if (checkResult.passed) {
    return { enforced: true, blocked: false, mode, overrideAvailable: false };
  }

  // Advisory mode: log but don't block
  if (mode === ENFORCEMENT_MODES.ADVISORY) {
    if (supabase) {
      await logEnforcementEvent(supabase, {
        guardrailId,
        sdId,
        mode,
        action: 'warned',
        violations: checkResult.violations || [],
      }, logger);
    }
    return { enforced: true, blocked: false, mode, overrideAvailable: false };
  }

  // Disabled mode: skip entirely
  if (mode === ENFORCEMENT_MODES.DISABLED) {
    return { enforced: false, blocked: false, mode, overrideAvailable: false };
  }

  // Blocking mode: check for existing override
  if (supabase) {
    const hasOverride = await checkExistingOverride(supabase, guardrailId, sdId, logger);
    if (hasOverride) {
      await logEnforcementEvent(supabase, {
        guardrailId,
        sdId,
        mode,
        action: 'override_applied',
        violations: checkResult.violations || [],
      }, logger);
      return { enforced: true, blocked: false, mode, overrideAvailable: true };
    }
  }

  // Block and log
  if (supabase) {
    await logEnforcementEvent(supabase, {
      guardrailId,
      sdId,
      mode,
      action: 'blocked',
      violations: checkResult.violations || [],
    }, logger);
  }

  return { enforced: true, blocked: true, mode, overrideAvailable: supabase != null };
}

/**
 * Request a chairman override for a blocked guardrail.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} params
 * @param {string} params.guardrailId - Guardrail that blocked
 * @param {string} params.sdId - SD UUID
 * @param {string} params.rationale - Why override is needed
 * @param {Object} [params.beforeState] - State before enforcement
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @returns {Promise<{ requested: boolean, decisionId: string|null, error?: string }>}
 */
export async function requestOverride(supabase, params, options = {}) {
  const { logger = console } = options;
  const { guardrailId, sdId, rationale, beforeState } = params;

  if (!supabase) {
    return { requested: false, decisionId: null, error: 'No supabase client' };
  }

  if (!guardrailId || !sdId || !rationale) {
    return { requested: false, decisionId: null, error: 'Missing required params' };
  }

  try {
    const decisionId = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from('chairman_decisions')
      .insert({
        id: decisionId,
        decision_type: 'guardrail_override',
        status: 'pending',
        context: {
          guardrail_id: guardrailId,
          sd_id: sdId,
          rationale,
          before_state: beforeState || null,
          requested_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.warn(`[GuardrailEnforcement] Override request failed: ${insertError.message}`);
      return { requested: false, decisionId: null, error: insertError.message };
    }

    logger.info(`[GuardrailEnforcement] Override requested for ${guardrailId} on SD ${sdId}`);
    return { requested: true, decisionId };
  } catch (err) {
    logger.warn(`[GuardrailEnforcement] Request error: ${err.message}`);
    return { requested: false, decisionId: null, error: err.message };
  }
}

/**
 * Get enforcement summary across all guardrails.
 *
 * @param {Object} supabase - Supabase client
 * @param {Object} [options]
 * @param {Object} [options.logger] - Logger instance
 * @param {number} [options.lookbackDays] - Days to look back (default: 30)
 * @returns {Promise<{ summary: Object, error?: string }>}
 */
export async function getEnforcementSummary(supabase, options = {}) {
  const { logger = console, lookbackDays = 30 } = options;

  if (!supabase) {
    return {
      summary: emptySummary(),
      error: 'No supabase client',
    };
  }

  try {
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    // Get enforcement events
    const { data: events, error: eventError } = await supabase
      .from('eva_event_log')
      .select('id, payload, created_at')
      .eq('event_type', 'guardrail_enforcement')
      .gte('created_at', cutoff);

    if (eventError) {
      logger.warn(`[GuardrailEnforcement] Summary query failed: ${eventError.message}`);
      return { summary: emptySummary(), error: eventError.message };
    }

    const all = events || [];

    // Get override decisions
    const { data: overrides, error: overrideError } = await supabase
      .from('chairman_decisions')
      .select('id, status, context, created_at')
      .eq('decision_type', 'guardrail_override')
      .gte('created_at', cutoff);

    if (overrideError) {
      logger.warn(`[GuardrailEnforcement] Override query failed: ${overrideError.message}`);
    }

    const overrideList = overrides || [];

    // Build summary
    const policy = { ...DEFAULT_ENFORCEMENT_POLICY };
    const blockingCount = Object.values(policy).filter((m) => m === 'blocking').length;
    const advisoryCount = Object.values(policy).filter((m) => m === 'advisory').length;

    let totalBlocked = 0;
    let totalWarned = 0;
    let totalOverrideApplied = 0;

    for (const event of all) {
      const action = event.payload?.action;
      if (action === 'blocked') totalBlocked++;
      else if (action === 'warned') totalWarned++;
      else if (action === 'override_applied') totalOverrideApplied++;
    }

    const pendingOverrides = overrideList.filter((o) => o.status === 'pending').length;
    const approvedOverrides = overrideList.filter((o) => o.status === 'approved').length;
    const rejectedOverrides = overrideList.filter((o) => o.status === 'rejected').length;
    const approvalRate = overrideList.length > 0
      ? Math.round((approvedOverrides / overrideList.length) * 100)
      : 0;

    return {
      summary: {
        totalGuardrails: Object.keys(policy).length,
        blockingCount,
        advisoryCount,
        enforcementEvents: all.length,
        totalBlocked,
        totalWarned,
        totalOverrideApplied,
        overrideRequests: overrideList.length,
        pendingOverrides,
        approvedOverrides,
        rejectedOverrides,
        approvalRate,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (err) {
    logger.warn(`[GuardrailEnforcement] Summary error: ${err.message}`);
    return { summary: emptySummary(), error: err.message };
  }
}

/**
 * Get the default enforcement policy.
 * @returns {Object}
 */
export function getEnforcementPolicy() {
  return { ...DEFAULT_ENFORCEMENT_POLICY };
}

/**
 * Get enforcement mode constants.
 * @returns {Object}
 */
export function getEnforcementModes() {
  return { ...ENFORCEMENT_MODES };
}

// ── Internal Helpers ─────────────────────────────

function getEffectiveMode(guardrailId, policyOverrides) {
  if (policyOverrides[guardrailId]) {
    return policyOverrides[guardrailId];
  }
  return DEFAULT_ENFORCEMENT_POLICY[guardrailId] || ENFORCEMENT_MODES.ADVISORY;
}

async function checkExistingOverride(supabase, guardrailId, sdId, logger) {
  try {
    const { data, error } = await supabase
      .from('chairman_decisions')
      .select('id')
      .eq('decision_type', 'guardrail_override')
      .eq('status', 'approved')
      .eq('context->>guardrail_id', guardrailId)
      .eq('context->>sd_id', sdId)
      .limit(1);

    if (error) {
      logger.warn(`[GuardrailEnforcement] Override check failed: ${error.message}`);
      return false;
    }

    return data && data.length > 0;
  } catch {
    return false;
  }
}

async function logEnforcementEvent(supabase, payload, logger) {
  try {
    await supabase.from('eva_event_log').insert({
      event_type: 'guardrail_enforcement',
      payload,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn(`[GuardrailEnforcement] Event log failed: ${err.message}`);
  }
}

function emptySummary() {
  return {
    totalGuardrails: 0,
    blockingCount: 0,
    advisoryCount: 0,
    enforcementEvents: 0,
    totalBlocked: 0,
    totalWarned: 0,
    totalOverrideApplied: 0,
    overrideRequests: 0,
    pendingOverrides: 0,
    approvedOverrides: 0,
    rejectedOverrides: 0,
    approvalRate: 0,
    generatedAt: new Date().toISOString(),
  };
}
