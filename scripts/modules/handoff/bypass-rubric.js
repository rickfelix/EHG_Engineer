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
  },
  {
    // SD-LEO-INFRA-VISION-FIDELITY-GATE-001 FR-4: VISION_FIDELITY_GATE bypass
    // when wireframe and PR diverge by design (e.g. wireframe shows post-backend
    // state but the PR ships pre-backend; backend lands in a follow-up SD).
    id: 'VISION_DELIBERATE_DEVIATION',
    pattern: /\b(wireframe|vision)\b.*\b(deviat|deliberat|intentional|post[-\s]?backend|pre[-\s]?backend|follow[\s-]?up\s*sd|differs?\s+by\s+design)\b/i,
    description: 'Intentional deviation between vision wireframe and implementation'
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
    // SD-LEO-INFRA-TIGHTEN-BYPASS-RUBRIC-001: the bare /unclear|confusing/ alternatives
    // over-matched legitimate domain vocabulary. During the CronGenius pilot a valid
    // TOOLING_BUG reason noting that an error message "is unclear about which check
    // failed" was wrongly REJECTED — because illegitimate rules are checked first, the
    // bare /unclear/ short-circuited before the TOOLING_BUG legitimate rule could match.
    // Tighten so unclear/confusing classify as illegitimate only when they describe the
    // AUTHOR not understanding the gate's requirements/intent (proximity to a
    // requirement/intent subject), not when they describe an artifact (error/output/
    // message) being unclear. The self-referential phrases (don't understand / don't
    // know why / no idea / I'm confused) stay always-illegitimate, preserving
    // enforcement for the genuine bypass-because-confused abuse case.
    pattern: /\b(don.?t\s*understand|don.?t\s*know\s*why|no\s*idea|i.?m\s*(so\s*)?confused)\b|\b(requirement|instruction|spec|criteria|rationale|intent|wording)s?\b[^.?!\n]{0,30}\b(unclear|confusing)\b|\b(unclear|confusing)\b[^.?!\n]{0,30}\b(requirement|instruction|spec|criteria|rationale|intent|what.?s\s*(being\s*)?asked)\b/i,
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

/**
 * SD-LEO-INFRA-GATE-FALSE-POSITIVE-001: Known NAMED semantic gates.
 *
 * Static fallback list used to validate gate tokens extracted from a bypass
 * reason. Numeric gates (0/2A/2B/2C/2D/3) are intentionally EXCLUDED — they are
 * already mapped by gate-health-check.js GATE_TO_CATEGORY. A caller may extend
 * this at runtime (e.g. with distinct validation_audit_log.validator_name values),
 * but the bypass write-path uses the static list to stay fast and I/O-free.
 */
export const KNOWN_NAMED_GATES = [
  'CROSS_REPO_STAGE_CONFIG_DRIFT',
  'GATE4_WORKFLOW_ROI',
  'WIRE_CHECK_GATE',
  'WIRE_CHECK_ADVISORY',
  'USER_STORY_COVERAGE',
  'GATE_VISION_SCORE',
  'VISION_FIDELITY_GATE',
  'SUB_AGENT_REPO_RESOLUTION',
  'RETROSPECTIVE_QUALITY_GATE',
  'SCOPE_AUDIT',
  'SMOKE_TEST_SPECIFICATION',
  'GATE_SD_METRICS_SUFFICIENCY',
  'GATE_PLACEHOLDER_CONTENT_DETECTION',
  'DB_CONTENT_PARITY',
  'MANDATORY_TESTING_VALIDATION',
  'GATE_INTEGRATION_CONTRACT'
];

// UPPERCASE_SNAKE tokens (≥1 underscore) — gate-name shaped. Numeric gate codes
// (0/2A/3 …) are deliberately not matched.
const GATE_TOKEN_RE = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
// Explicit operator override: `[gate:NAME]` anywhere in the reason.
const GATE_OVERRIDE_RE = /\[gate:\s*([A-Za-z][A-Za-z0-9_]+)\s*\]/i;

/**
 * SD-LEO-INFRA-GATE-FALSE-POSITIVE-001: Extract the NAMED semantic gate a bypass
 * targeted, from its free-text reason. PURE (no I/O); never throws.
 *
 * Resolution order:
 *   1. Explicit `[gate:NAME]` override marker (validated against the known set,
 *      but an unknown explicit name is still trusted — operator intent wins).
 *   2. UPPERCASE_SNAKE tokens in the reason intersected with the known-gate set;
 *      the longest match wins (favours the most specific gate name).
 *   3. null — unidentifiable. Callers MUST treat null as non-fatal and never
 *      block the bypass on it.
 *
 * @param {string} reason - bypass reason text
 * @param {string[]} [extraGates=[]] - additional known gate names to recognize
 * @returns {string|null} the named gate, or null
 */
export function extractBypassedGate(reason, extraGates = []) {
  if (!reason || typeof reason !== 'string') return null;
  const known = new Set(
    [...KNOWN_NAMED_GATES, ...(Array.isArray(extraGates) ? extraGates : [])]
      .filter((g) => typeof g === 'string' && g.length > 0)
  );

  // 1. Explicit override marker
  const ov = reason.match(GATE_OVERRIDE_RE);
  if (ov) {
    const upper = ov[1].toUpperCase();
    for (const g of known) {
      if (g.toUpperCase() === upper) return g;
    }
    return ov[1]; // explicit but unknown — trust the operator
  }

  // 2. Regex tokens ∩ known-gate set; longest match wins
  const matches = (reason.match(GATE_TOKEN_RE) || []).filter((t) => known.has(t));
  if (matches.length > 0) {
    return matches.sort((a, b) => b.length - a.length)[0];
  }

  // 3. Unidentifiable
  return null;
}

/**
 * SD-LEO-INFRA-GATE-FALSE-POSITIVE-001: tally bypass audit rows by named gate.
 * PURE (no I/O) so the leaderboard aggregation is unit-testable independently of
 * the DB fetch in gate-health-check.js.
 *
 * @param {Array<{metadata?: {bypassed_gate?: string|null}}>} rows - bypass audit rows
 * @returns {{ ranked: Array<{gate:string,count:number}>, unattributed:number, total:number }}
 *   ranked: named gates by descending bypass count; unattributed: rows with null/absent
 *   bypassed_gate; total: rows considered.
 */
export function tallyBypassedGates(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = new Map();
  let unattributed = 0;
  for (const row of list) {
    const gate = row && row.metadata ? row.metadata.bypassed_gate : null;
    if (gate && typeof gate === 'string') {
      counts.set(gate, (counts.get(gate) || 0) + 1);
    } else {
      unattributed += 1;
    }
  }
  const ranked = [...counts.entries()]
    .map(([gate, count]) => ({ gate, count }))
    .sort((a, b) => b.count - a.count);
  return { ranked, unattributed, total: list.length };
}
