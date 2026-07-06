/**
 * Exit-gate enforcer for venture stage advance.
 *
 * SD-LEO-FEAT-STAGE-BUILD-REPLIT-001 / FR-2 / TR-2 / TR-3
 *
 * Reads `lifecycle_stage_config.metadata.gates.exit` for the from_stage,
 * dispatches each declared gate string to a verifier from
 * exit-gate-verifiers.GATE_VERIFIERS, and returns a structured payload the
 * caller renders as a user-actionable error or uses to authorize the
 * advance_venture_stage RPC call.
 *
 * Why Node-side instead of a SQL trigger:
 *   gates.exit entries are author-specified prose (e.g. "Application deployed",
 *   "GitHub repo URL stored in venture_resources"). A SQL trigger cannot
 *   interpret prose; this Node-side dispatcher with a verifier-map can grow
 *   as new stages declare new gates without touching the RPC. database-agent
 *   confirmed the existing `fn_advance_venture_stage` RPC has its own
 *   `artifact_gate` (20260406_add_artifact_gate_to_fn_advance_venture_stage.sql)
 *   that checks `stage_artifact_requirements`. This enforcer COMPOSES with
 *   that — it adds metadata.gates.exit checks beyond the existing required-
 *   artifact gate.
 *
 * Feature flag: LEO_S19_EXIT_GATE_ENFORCER
 *   ON  (default) — enforce gates, refuse advance when not all satisfied.
 *   OFF           — log a structured WARN and pass-through (legacy behavior).
 *   Read once at module-load via process.env. Process restart required to
 *   change state (TR-3).
 *
 * @module lib/eva/lifecycle/exit-gate-enforcer
 */

import { resolveVerifier } from './exit-gate-verifiers.js';

const FLAG_NAME = 'LEO_S19_EXIT_GATE_ENFORCER';
const FLAG_VALUE = (() => {
  const raw = process.env[FLAG_NAME];
  if (raw === undefined || raw === '') return 'on'; // default ON for new ventures
  return String(raw).toLowerCase();
})();

/**
 * @typedef {Object} EnforcerResult
 * @property {boolean} allowed — true when the advance is authorized.
 * @property {string[]} blocked_by — reasons each unsatisfied gate failed; empty when allowed.
 * @property {string[]} gates_checked — the prose strings actually dispatched.
 * @property {number} stage_number — the from_stage we evaluated.
 * @property {boolean} flag_enforced — whether enforcement was active for this call.
 * @property {string[]} would_block_by — SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-2): reasons
 *   each unsatisfied OBSERVE-ONLY gate (metadata.gates.exit_observe) would have failed. NEVER
 *   affects `allowed` — purely diagnostic, logged to system_events for the FR-3 bind criterion.
 */

/**
 * SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-2): best-effort system_events write for one
 * observe-only gate evaluation. Never throws — a logging failure must not affect the
 * (already non-blocking) observe-only evaluation itself.
 */
async function logObserveOnlyEvent({ supabase, eventType, ventureId, stageNumber, gateString, wouldSatisfy, reason }) {
  try {
    const stamp = new Date().toISOString();
    await supabase.from('system_events').insert({
      event_type: eventType,
      venture_id: ventureId,
      stage_id: stageNumber,
      idempotency_key: `${eventType}:${ventureId}:${stageNumber}:${gateString}:${Date.parse(stamp)}`,
      payload: { venture_id: ventureId, stage_number: stageNumber, gate_string: gateString, would_satisfy: wouldSatisfy, reason },
      details: { venture_id: ventureId, stage_number: stageNumber, gate_string: gateString, would_satisfy: wouldSatisfy, reason },
      created_at: stamp,
    });
  } catch (err) {
    console.warn(`[exit-gate-enforcer] observe-only event log failed (non-fatal): ${err.message}`);
  }
}

/**
 * Evaluate whether a venture is allowed to advance from `fromStage`. Caller is
 * responsible for invoking the actual advance RPC when allowed===true.
 *
 * Empty / missing gates.exit → allowed (no gates to check).
 * Unknown gate strings (no verifier registered) → logged and skipped (allow),
 * matching the staged-rollout philosophy of TR-3.
 *
 * @param {Object} args
 * @param {import('@supabase/supabase-js').SupabaseClient} args.supabase
 * @param {string} args.ventureId
 * @param {number} args.fromStage
 * @returns {Promise<EnforcerResult>}
 */
export async function checkExitGates({ supabase, ventureId, fromStage }) {
  const flagEnforced = FLAG_VALUE !== 'off' && FLAG_VALUE !== '0' && FLAG_VALUE !== 'false';

  if (!flagEnforced) {
    console.warn(`[exit-gate-enforcer] ${FLAG_NAME}=${FLAG_VALUE} — enforcement skipped for venture=${ventureId} from_stage=${fromStage}`);
    return {
      allowed: true,
      blocked_by: [],
      gates_checked: [],
      would_block_by: [],
      stage_number: fromStage,
      flag_enforced: false,
    };
  }

  // Read the gates.exit / gates.exit_observe declaration for this stage.
  const { data: stageConfig, error: cfgError } = await supabase
    .from('venture_stages') // SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-B: unified superset
    .select('metadata')
    .eq('stage_number', fromStage)
    .maybeSingle();

  if (cfgError) {
    // Treat config read failure as a hard block — surface the error to the caller.
    return {
      allowed: false,
      blocked_by: [`venture_stages read failed: ${cfgError.message}`],
      gates_checked: [],
      would_block_by: [],
      stage_number: fromStage,
      flag_enforced: true,
    };
  }

  // SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (FR-2): dispatch gates.exit_observe INDEPENDENTLY
  // of gates.exit — observe-only gates never affect `allowed`/`blocked_by`, only the
  // diagnostic `would_block_by` + a system_events row per evaluation (the FR-3 bind-criterion
  // data source). Runs even when gates.exit is empty, so a stage with ONLY observe-only gates
  // still gets evaluated.
  const gatesExitObserve = stageConfig?.metadata?.gates?.exit_observe;
  const would_block_by = [];
  if (Array.isArray(gatesExitObserve) && gatesExitObserve.length > 0) {
    for (const gateString of gatesExitObserve) {
      const verifier = resolveVerifier(gateString);
      if (!verifier) {
        console.warn(`[exit-gate-enforcer] No verifier registered for observe-only gate "${gateString}" at stage ${fromStage} — skipping.`);
        continue;
      }
      const { satisfied, reason } = await verifier({ supabase, ventureId, fromStage });
      if (!satisfied) would_block_by.push(`${gateString}: ${reason}`);
      await logObserveOnlyEvent({
        supabase, eventType: 'EXIT_GATE_OBSERVE_ONLY', ventureId, stageNumber: fromStage,
        gateString, wouldSatisfy: satisfied, reason,
      });
    }
  }

  const gatesExit = stageConfig?.metadata?.gates?.exit;
  if (!Array.isArray(gatesExit) || gatesExit.length === 0) {
    // No BINDING gates declared → allow (would_block_by from exit_observe above still surfaces).
    return {
      allowed: true,
      blocked_by: [],
      gates_checked: [],
      would_block_by,
      stage_number: fromStage,
      flag_enforced: true,
    };
  }

  const blocked_by = [];
  const gates_checked = [];

  for (const gateString of gatesExit) {
    gates_checked.push(gateString);
    const verifier = resolveVerifier(gateString);
    if (!verifier) {
      console.warn(`[exit-gate-enforcer] No verifier registered for gate "${gateString}" at stage ${fromStage} — skipping (allow).`);
      continue;
    }
    const { satisfied, reason } = await verifier({ supabase, ventureId, fromStage });
    if (!satisfied) {
      blocked_by.push(`${gateString}: ${reason}`);
    }
  }

  return {
    allowed: blocked_by.length === 0,
    blocked_by,
    gates_checked,
    would_block_by,
    stage_number: fromStage,
    flag_enforced: true,
  };
}

/**
 * Read-only flag inspector for tests and diagnostics.
 * @returns {{ name: string, value: string, enforced: boolean }}
 */
export function getEnforcementFlag() {
  return {
    name: FLAG_NAME,
    value: FLAG_VALUE,
    enforced: FLAG_VALUE !== 'off' && FLAG_VALUE !== '0' && FLAG_VALUE !== 'false',
  };
}
