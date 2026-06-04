/**
 * Live wiring for the PLAN->EXEC venture-leaf evidence gate
 * SD-LEO-INFRA-WIRE-PRE-BUILD-001 — FR-2 (Phase A)
 *
 * leaf-gate.js (U5) is PURE decision logic. This module is the live consumer the
 * module doc described: it (1) decides whether the SD is a venture-build leaf,
 * (2) queries sub_agent_execution_results for FRESH compliance evidence, and
 * (3) feeds that into evaluateLeafReadiness, returning a handoff-gate result.
 *
 * Scoping (R5): a venture-build leaf is a DESCENDANT of a leo_bridge orchestrator —
 * explicitly NOT `!parent_sd_id` (that matches only the top orchestrator and would
 * skip every real leaf). We detect it structurally from the bridge-stamped metadata:
 *   - metadata.venture_id present  (venture-derived; EHG_Engineer infra SDs have none)
 *   - has a parent_sd_id           (it DESCENDS from the orchestrator tree)
 *   - is itself buildable, not an orchestrator/parent node
 * EHG_Engineer SDs (no venture_id) are never venture leaves, so this gate is a
 * no-op for them — including ones that legitimately mention Supabase (the
 * EHG_Engineer stack), which the venture policy forbids. That fleet-safety
 * property is covered by an explicit negative test.
 *
 * Freshness (R6): storeSubAgentResults dedups within 5 minutes by UPDATING the row
 * and STRIPPING created_at (results-storage.js), so a re-run keeps the original
 * created_at and only bumps updated_at. Keying freshness on created_at alone
 * (as the legacy shared gate does) would treat a just-refreshed row as stale.
 * We treat a row as fresh when max(created_at, updated_at) >= phaseStart.
 *
 * Enforcement (Phase A dark-ship): blocking is behind VENTURE_LEAF_GATE_ENFORCE
 * (default OFF). OFF => observe/warn (pass with a WOULD-BLOCK warning) so venture
 * builds do not stall before the evidence-producing driver (FR-3, deferred) is
 * wired. ON => block with SUBAGENT_EVIDENCE_MISSING. The blocking path is fully
 * built and unit-tested; the follow-on SD flips the flag alongside the driver.
 *
 * @module lib/eva/bridge/leaf-gate-live
 */

import { evaluateLeafReadiness } from './leaf-gate.js';

/** Verdicts that mean a present evidence row does NOT satisfy the requirement. */
const FAILING_VERDICTS = new Set(['FAIL', 'BLOCKED', 'CRITICAL', 'REJECTED', 'ERROR']);

/** The deterministic compliance floor every venture-build leaf must satisfy. */
export const VENTURE_LEAF_REQUIRED_FLOOR = Object.freeze(['VENTURE_STACK']);

/**
 * Parse a DB timestamp treating naive (no-TZ) strings as UTC. PostgREST returns
 * timestamp-without-time-zone columns as naive strings; `new Date()` would parse
 * them as LOCAL and skew freshness by the UTC offset. (Mirrors subagent-evidence-gate.)
 * @param {string|Date|null} ts
 * @returns {number} epoch ms (0 when absent/unparseable)
 */
export function tsToEpoch(ts) {
  if (!ts) return 0;
  if (ts instanceof Date) return ts.getTime();
  const hasTZ = /Z$|[+-]\d{2}:?\d{2}$/.test(ts);
  const d = new Date(hasTZ ? ts : ts + 'Z');
  const n = d.getTime();
  return Number.isNaN(n) ? 0 : n;
}

/** Normalize an agent code: uppercase, strip trailing -AGENT, hyphens => underscore. */
function normCode(s) {
  return String(s || '').toUpperCase().replace(/-AGENT$/, '').replace(/-+/g, '_');
}

/** True when enforcement (blocking) is enabled via env (Phase A default: OFF). */
export function isEnforcementEnabled(env = process.env) {
  const v = env.VENTURE_LEAF_GATE_ENFORCE;
  return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}

/**
 * Parse the pilot enrollment allow-list from env — a CSV of sd_keys.
 * SD-LEO-INFRA-WIRE-PRE-BUILD-002 FR-5.
 * @param {object} [env]
 * @returns {string[]}
 */
export function parseEnforceAllowList(env = process.env) {
  return String(env.VENTURE_LEAF_GATE_ENFORCE_SD_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Pilot-scoped enforce resolver (FR-5). Decides whether the live venture-leaf gate
 * should ENFORCE (block) for ONE specific leaf, WITHOUT flipping the global default
 * fleet-wide (risk R1). Any single enrollment signal enrolls the leaf:
 *   - the global VENTURE_LEAF_GATE_ENFORCE switch is ON (isEnforcementEnabled), OR
 *   - sd.sd_key is in the VENTURE_LEAF_GATE_ENFORCE_SD_KEYS allow-list, OR
 *   - the leaf carries metadata.venture_leaf_gate_enforce === true.
 * isEnforcementEnabled() is deliberately left as the PURE global switch (its own
 * tests pin that semantics) — this resolver composes it caller-side; pass the
 * result into evaluateLeafReadinessLive({ enforce }). Default (no enrollment,
 * global OFF) returns false so non-enrolled leaves OBSERVE.
 * @param {object} sd - SD row (sd_key/id + metadata)
 * @param {object} [env]
 * @param {string[]} [allowList] - defaults to parseEnforceAllowList(env)
 * @returns {boolean}
 */
export function resolveLeafEnforce(sd, env = process.env, allowList = parseEnforceAllowList(env)) {
  if (isEnforcementEnabled(env)) return true;
  if (!sd || typeof sd !== 'object') return false;
  const key = sd.sd_key || sd.id;
  if (key && Array.isArray(allowList) && allowList.includes(key)) return true;
  const m = sd.metadata || {};
  if (m.venture_leaf_gate_enforce === true) return true;
  return false;
}

/**
 * Structural venture-build-leaf detector (R5).
 * @param {object} sd - strategic_directives_v2 row (needs sd_type, parent_sd_id, metadata)
 * @returns {boolean}
 */
export function isVentureBuildLeaf(sd) {
  if (!sd || typeof sd !== 'object') return false;
  const m = sd.metadata || {};
  const ventureDerived = Boolean(m.venture_id || m.ventureId);
  const descends = Boolean(sd.parent_sd_id); // descendant of the orchestrator tree (NOT !parent_sd_id)
  const isOrchestrator = String(sd.sd_type || '').toLowerCase() === 'orchestrator' || m.is_parent === true;
  return ventureDerived && descends && !isOrchestrator;
}

/**
 * Live evaluation of a venture-build leaf's PLAN->EXEC readiness.
 *
 * Pure w.r.t. its inputs: the supabase client and phaseStartedAt are injected, so
 * this is fully unit-testable with a supabase double and a fixed clock.
 *
 * @param {object}   params
 * @param {object}   params.sd            - the SD row
 * @param {object}   params.supabase      - supabase client (injectable)
 * @param {Date}     params.phaseStartedAt- current-phase start anchor (freshness floor)
 * @param {string[]} [params.required]    - required agent codes (default VENTURE_STACK floor)
 * @param {boolean}  [params.enforce]     - block when not ready (default from env)
 * @returns {Promise<object>} handoff gate result ({passed, score, maxScore, max_score, issues, warnings, details})
 */
export async function evaluateLeafReadinessLive({
  sd,
  supabase,
  phaseStartedAt,
  required = VENTURE_LEAF_REQUIRED_FLOOR,
  enforce = undefined,
} = {}) {
  const pass = (extra) => ({ passed: true, score: 100, maxScore: 100, max_score: 100, issues: [], warnings: [], ...extra });

  // Non-venture SDs (e.g. every EHG_Engineer infra SD) are out of scope → no-op pass.
  if (!isVentureBuildLeaf(sd)) {
    return pass({ details: { skipped: true, skipReason: 'NOT_VENTURE_LEAF', sd_key: sd?.sd_key } });
  }

  const sdUuid = sd.id || sd.sd_id;
  const requiredNorm = required.map(normCode);
  const floorMs = phaseStartedAt instanceof Date ? phaseStartedAt.getTime() : tsToEpoch(phaseStartedAt);

  // Query compliance evidence for this leaf.
  let rows;
  try {
    const { data, error } = await supabase
      .from('sub_agent_execution_results')
      .select('sub_agent_code, created_at, updated_at, verdict')
      .eq('sd_id', sdUuid)
      .in('sub_agent_code', required);
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    // Fail-closed only when enforcing; otherwise observe (a DB hiccup must not stall builds).
    const detail = { reason: 'DB_ERROR', error: e?.message || String(e), sd_key: sd.sd_key };
    if (isEnforcementEnabled() === false && enforce !== true) {
      return pass({ warnings: [`venture-leaf gate: evidence query failed (observe mode): ${detail.error}`], details: detail });
    }
    return { passed: false, score: 0, maxScore: 100, max_score: 100, issues: [`venture-leaf evidence query failed: ${detail.error}`], warnings: [], details: detail };
  }

  // Present = required codes that have a FRESH row with a non-failing verdict.
  // Non-compliant (fresh FAIL) is tracked separately for a clearer reason.
  const present = new Set();
  const nonCompliant = new Set();
  for (const r of rows) {
    const code = normCode(r?.sub_agent_code);
    if (!requiredNorm.includes(code)) continue;
    const fresh = Math.max(tsToEpoch(r.created_at), tsToEpoch(r.updated_at)) >= floorMs; // R6
    if (!fresh) continue;
    if (FAILING_VERDICTS.has(String(r.verdict || '').toUpperCase())) nonCompliant.add(code);
    else present.add(code);
  }

  // Phase A enforces the evidence-presence dimension only; U3 verification + U4 DAG
  // are satisfied here and become live with the FR-3 driver (deferred follow-on).
  const readiness = evaluateLeafReadiness({
    required: requiredNorm,
    present: [...present],
    verification: { survives: true },
    dag: { valid: true },
  });

  const details = {
    sd_key: sd.sd_key,
    is_venture_leaf: true,
    required: requiredNorm,
    present: [...present],
    missing: readiness.missingAgents,
    non_compliant: [...nonCompliant],
    phase_started_at: new Date(floorMs).toISOString(),
  };

  if (readiness.ready && nonCompliant.size === 0) {
    return pass({ details });
  }

  // Not ready: build the human-facing reason.
  const issueParts = [];
  if (readiness.missingAgents.length) issueParts.push(`SUBAGENT_EVIDENCE_MISSING: ${readiness.missingAgents.join(', ')}`);
  if (nonCompliant.size) issueParts.push(`VENTURE_STACK_NON_COMPLIANT: ${[...nonCompliant].join(', ')} (forbidden venture-stack tech specified)`);
  const enforcing = enforce === undefined ? isEnforcementEnabled() : enforce;

  if (!enforcing) {
    // Observe/warn — do not stall the build before the evidence driver exists.
    return pass({
      warnings: [`venture-leaf gate (observe mode — set VENTURE_LEAF_GATE_ENFORCE=1 to block): WOULD BLOCK ${sd.sd_key}: ${issueParts.join('; ')}`],
      details: { ...details, mode: 'observe', would_block: true },
    });
  }

  return {
    passed: false,
    score: 0,
    maxScore: 100,
    max_score: 100,
    issues: issueParts,
    warnings: [],
    details: { ...details, mode: 'enforce', reason: readiness.reason },
    remediation: `Venture-build leaf ${sd.sd_key} must have fresh, compliant VENTURE_STACK evidence before PLAN->EXEC. Invoke it: node scripts/execute-subagent.js --code VENTURE_STACK --sd-id ${sd.sd_key}.`,
  };
}

export default { evaluateLeafReadinessLive, isVentureBuildLeaf, isEnforcementEnabled, resolveLeafEnforce, parseEnforceAllowList, VENTURE_LEAF_REQUIRED_FLOOR };
