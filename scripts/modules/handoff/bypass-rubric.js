/**
 * Bypass Rubric — CONST-015: Bypass Governance & Reason Validation
 * Part of SD-MAN-ORCH-SCOPE-INTEGRITY-CONSTITUTIONAL-001-E
 *
 * Defines legitimate vs illegitimate bypass reasons and validates
 * bypass requests against the rubric before allowing gate overrides.
 */

/**
 * Legitimate bypass reason categories.
 * These represent genuine environmental or tooling issues
 * that are outside the SD author's control.
 */
export const LEGITIMATE_REASONS = [
  {
    id: 'ENV_UNAVAILABLE',
    pattern: /\b(test\s*env|staging|environment)\b.*\b(down|unavailable|unreachable|broken|offline)\b/i,
    description: 'Test/staging environment is down or unreachable'
  },
  {
    id: 'EXTERNAL_API_DOWN',
    pattern: /\b(external|third[\s-]?party|api|service)\b.*\b(down|unavailable|outage|timeout|rate[\s-]?limit)\b/i,
    description: 'External API or third-party service is unavailable'
  },
  {
    id: 'TOOLING_BUG',
    pattern: /\b(tooling|tool|script|gate|validator)\b.*\b(bug|broken|incorrect|false[\s-]?positive|regression)\b/i,
    description: 'Gate tooling has a known bug producing false positives'
  },
  {
    id: 'DEPENDENCY_BLOCKED',
    pattern: /\b(dependency|upstream|blocking|blocked)\b.*\b(not\s*merged|pending|waiting|pr|pull[\s-]?request)\b/i,
    description: 'Upstream dependency PR not yet merged'
  },
  {
    id: 'INFRA_MIGRATION',
    pattern: /\b(migration|infra|infrastructure)\b.*\b(pending|in[\s-]?progress|deploying|rollout)\b/i,
    description: 'Infrastructure migration in progress'
  }
];

/**
 * Illegitimate bypass reason patterns.
 * These indicate the SD should be fixed rather than bypassed.
 * Always rejected — no override possible.
 */
export const ILLEGITIMATE_REASONS = [
  {
    id: 'GATE_TOO_STRICT',
    pattern: /\b(gate|threshold|check)\b.*\b(too\s*strict|too\s*high|unreasonable|annoying|overkill)\b/i,
    description: 'Attempting to bypass because gate threshold feels too strict'
  },
  {
    id: 'TAKING_TOO_LONG',
    pattern: /\b(taking\s*too\s*long|too\s*slow|hurry|rush|skip|shortcut|faster)\b/i,
    description: 'Attempting to bypass to save time'
  },
  {
    id: 'DONT_UNDERSTAND',
    pattern: /\b(don.t\s*understand|unclear|confusing|don.t\s*know\s*why|no\s*idea)\b/i,
    description: 'Attempting to bypass due to not understanding the gate'
  },
  {
    id: 'WORKS_ON_MY_MACHINE',
    pattern: /\b(works?\s*(on\s*my|locally|fine|for\s*me)|it.s\s*fine|good\s*enough)\b/i,
    description: 'Attempting to bypass because code works locally'
  }
];

/**
 * Validate a bypass reason against the rubric.
 *
 * @param {string} reason - The bypass reason text (min 20 chars enforced by CLI)
 * @returns {{ allowed: boolean, category: string|null, matchedRule: string|null, explanation: string }}
 */
export function validateBypassReason(reason) {
  if (!reason || typeof reason !== 'string') {
    return {
      allowed: false,
      category: 'INVALID',
      matchedRule: null,
      explanation: 'Bypass reason is required and must be a non-empty string'
    };
  }

  // Check illegitimate reasons first (always rejected)
  for (const rule of ILLEGITIMATE_REASONS) {
    if (rule.pattern.test(reason)) {
      return {
        allowed: false,
        category: 'ILLEGITIMATE',
        matchedRule: rule.id,
        explanation: `Rejected: ${rule.description}. Fix the underlying issue instead of bypassing.`
      };
    }
  }

  // Check legitimate reasons
  for (const rule of LEGITIMATE_REASONS) {
    if (rule.pattern.test(reason)) {
      return {
        allowed: true,
        category: 'LEGITIMATE',
        matchedRule: rule.id,
        explanation: `Allowed: ${rule.description}`
      };
    }
  }

  // No pattern matched — allow with warning (unclassified)
  // Unclassified reasons are logged for manual review
  return {
    allowed: true,
    category: 'UNCLASSIFIED',
    matchedRule: null,
    explanation: 'Reason did not match known patterns. Allowed but flagged for review.'
  };
}

/**
 * SD-LEARN-FIX-ADDRESS-PAT-AGENT-001: Bypass Shape Validation
 *
 * Verifies that every --bypass-validation call is paired with enforcement-table evidence
 * (--pattern-id referencing an existing issue_patterns row, or --followup-sd-key referencing
 * an existing draft strategic_directives_v2 row). Prose-only bypass reasons write to
 * audit_log alone, which is invisible to downstream gates and queues — the original
 * PAT-AGENT-BYPASS-WITHOUT-RCA deviation.
 *
 * Gated by env var ENFORCE_BYPASS_SHAPE. Default false (warn-only). Flip to true after
 * 48h soak per rollout plan.
 *
 * @param {object} params
 * @param {string|null} params.patternId - Value of --pattern-id, or null
 * @param {string|null} params.followupSdKey - Value of --followup-sd-key, or null
 * @param {object} params.supabase - Supabase client
 * @param {string} [params.bypassReason] - Bypass reason text (for logging only)
 * @param {string} [params.sdId] - SD ID (for audit)
 * @param {string} [params.handoffType] - Handoff type (for audit)
 * @returns {Promise<{ allowed: boolean, code: string, message: string, warnOnly: boolean }>}
 */
export async function validateBypassShape({ patternId, followupSdKey, supabase, bypassReason, sdId, handoffType }) {
  const enforceFlag = process.env.ENFORCE_BYPASS_SHAPE === 'true';
  const warnOnly = !enforceFlag;

  // Neither flag supplied — shape violation
  if (!patternId && !followupSdKey) {
    const message = `ERR_BYPASS_SHAPE: --bypass-validation requires --pattern-id <PAT-XXX> or --followup-sd-key <SD-XXX>. Prose reason alone is not permitted — it writes to audit_log but downstream gates cannot query it. File a pattern via /learn or a draft SD via \`node scripts/leo-create-sd.js\`, then retry. (ENFORCE_BYPASS_SHAPE=${enforceFlag ? 'true' : 'false'}${warnOnly ? ', warn-only — call allowed this time' : ''})`;

    // Audit the shape violation (regardless of warn/block)
    if (supabase && sdId) {
      supabase.from('validation_audit_log').insert({
        correlation_id: `bypass-shape-${Date.now()}`,
        sd_id: sdId,
        validator_name: 'bypass_shape',
        failure_reason: `Bypass shape violation: no --pattern-id or --followup-sd-key (warn_only=${warnOnly})`,
        failure_category: warnOnly ? 'bypass_shape_warning' : 'bypass_shape_rejected',
        metadata: { handoff_type: handoffType, reason_text: bypassReason, enforce_flag: enforceFlag },
        execution_context: 'bypass_shape_gate'
      }).then(({ error }) => {
        if (error) console.warn(`   ⚠️  Bypass shape audit log failed: ${error.message}`);
      });
    }

    return { allowed: warnOnly, code: 'ERR_BYPASS_SHAPE', message, warnOnly };
  }

  // Pattern-id supplied — verify it exists in issue_patterns
  if (patternId) {
    const { data, error } = await supabase
      .from('issue_patterns')
      .select('pattern_id, status')
      .eq('pattern_id', patternId)
      .maybeSingle();

    if (error || !data) {
      const message = `ERR_BYPASS_SHAPE: --pattern-id "${patternId}" not found in issue_patterns. Create the pattern first via /learn or retro-agent, then retry. (ENFORCE_BYPASS_SHAPE=${enforceFlag ? 'true' : 'false'})`;
      return { allowed: warnOnly, code: 'ERR_BYPASS_SHAPE', message, warnOnly };
    }
  }

  // Followup-sd-key supplied — verify it exists
  if (followupSdKey) {
    const { data, error } = await supabase
      .from('strategic_directives_v2')
      .select('sd_key, status')
      .eq('sd_key', followupSdKey)
      .maybeSingle();

    if (error || !data) {
      const message = `ERR_BYPASS_SHAPE: --followup-sd-key "${followupSdKey}" not found in strategic_directives_v2. Create the draft SD first via \`node scripts/leo-create-sd.js\`, then retry. (ENFORCE_BYPASS_SHAPE=${enforceFlag ? 'true' : 'false'})`;
      return { allowed: warnOnly, code: 'ERR_BYPASS_SHAPE', message, warnOnly };
    }
  }

  return { allowed: true, code: 'OK', message: 'Bypass shape validated', warnOnly: false };
}

/**
 * Enhanced bypass check that combines rubric validation with rate limiting.
 * Drop-in replacement for the reason validation portion of checkBypassRateLimits.
 *
 * @param {string} reason - The bypass reason text
 * @param {object} [options] - Options
 * @param {object} [options.supabase] - Supabase client for audit logging
 * @param {string} [options.sdId] - SD ID for audit context
 * @param {string} [options.handoffType] - Handoff type for audit context
 * @returns {{ allowed: boolean, category: string, matchedRule: string|null, explanation: string }}
 */
export function validateAndClassifyBypass(reason, options = {}) {
  const result = validateBypassReason(reason);

  // Log classification for audit trail (non-blocking)
  if (options.supabase && options.sdId) {
    options.supabase
      .from('validation_audit_log')
      .insert({
        correlation_id: `bypass-rubric-${Date.now()}`,
        sd_id: options.sdId,
        validator_name: 'bypass_rubric',
        failure_reason: result.allowed
          ? `Bypass ALLOWED (${result.category}): ${reason}`
          : `Bypass REJECTED (${result.category}): ${reason}`,
        failure_category: result.allowed ? 'bypass' : 'bypass_rejected',
        metadata: {
          handoff_type: options.handoffType,
          rubric_category: result.category,
          matched_rule: result.matchedRule,
          reason_text: reason
        },
        execution_context: 'bypass_rubric'
      })
      .then(({ error }) => {
        if (error) console.warn(`   ⚠️  Bypass rubric audit log failed: ${error.message}`);
      });
  }

  return result;
}
