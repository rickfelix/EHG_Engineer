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
 * SD-LEO-INFRA-VENTURE-DATA-CAPTURE-EMISSION-001-B (SD-0b / FR-3 — gate emission):
 *   This enforcer does NOT write `stage_executions` (nor any exec-path record) — it only
 *   READS `venture_stages.metadata.gates` config and writes advisory `system_events` rows
 *   (EXIT_GATE_ANOMALY / EXIT_GATE_OBSERVE_ONLY). The real-vs-simulated `build_kind` tag is
 *   therefore emitted at the entry/exit stage_executions writes in
 *   lib/eva/stage-execution-worker.js (FR-2) — the stage_executions row for the GATED stage
 *   already carries `metadata.build_kind`, so the gate transition is covered with NO change
 *   required here. (If this enforcer ever gains its own stage_executions/exec-path write, add
 *   the additive+fail-soft build_kind merge at that write, mirroring FR-2.)
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
 * SD-LEO-INFRA-EXIT-GATE-FAIL-CLOSED-POLARITY-001 (FR-3): best-effort
 * EXIT_GATE_ANOMALY system_events write, mirroring logObserveOnlyEvent's proven
 * fail-soft shape. Never throws — a logging failure must never affect the
 * (already fail-closed) blocking verdict itself.
 *
 * @param {Object} args
 * @param {'unresolvable_binding_verifier'|'stage_config_row_missing'} args.anomalyKind
 */
async function logAnomalyEvent({ supabase, ventureId, stageNumber, anomalyKind, gateString = null, reason }) {
  try {
    const stamp = new Date().toISOString();
    await supabase.from('system_events').insert({
      event_type: 'EXIT_GATE_ANOMALY',
      venture_id: ventureId,
      stage_id: stageNumber,
      idempotency_key: `EXIT_GATE_ANOMALY:${ventureId}:${stageNumber}:${anomalyKind}:${gateString ?? ''}:${Date.parse(stamp)}`,
      payload: { anomaly_kind: anomalyKind, venture_id: ventureId, stage_number: stageNumber, gate_string: gateString, reason },
      details: { anomaly_kind: anomalyKind, venture_id: ventureId, stage_number: stageNumber, gate_string: gateString, reason },
      created_at: stamp,
    });
  } catch (err) {
    console.warn(`[exit-gate-enforcer] anomaly event log failed (non-fatal): ${err.message}`);
  }
}

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
 * Row present, empty / missing gates.exit → allowed (no gates to check).
 * MISSING venture_stages row → BLOCK + EXIT_GATE_ANOMALY (fail-closed —
 * SD-LEO-INFRA-EXIT-GATE-FAIL-CLOSED-POLARITY-001 HP-2).
 * Unknown gate strings on BINDING gates.exit → BLOCK + EXIT_GATE_ANOMALY
 * (fail-closed — HP-1); log-and-allow remains ONLY for gates.exit_observe.
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

  // SD-LEO-INFRA-EXIT-GATE-FAIL-CLOSED-POLARITY-001 (HP-2/FR-2): a MISSING
  // venture_stages row is not a cfgError (maybeSingle returns data:null,
  // error:null) and previously null-chained through gates?.exit -> undefined
  // -> silent allow. Advancing FROM a stage the config table does not know is
  // itself anomalous: block loudly. Row PRESENT with empty/absent gates keeps
  // the intended allow path below.
  if (!stageConfig) {
    const reason = `venture_stages row missing for stage ${fromStage} (fail-closed): advancing FROM an unknown stage is anomalous`;
    await logAnomalyEvent({ supabase, ventureId, stageNumber: fromStage, anomalyKind: 'stage_config_row_missing', reason });
    return {
      allowed: false,
      blocked_by: [reason],
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
      // SD-LEO-INFRA-EXIT-GATE-FAIL-CLOSED-POLARITY-001 (HP-1/FR-1): a
      // declared-but-unresolvable verifier on a BINDING gate is fail-CLOSED —
      // the author declared a gate the runtime cannot check, and allowing
      // through an uncheckable gate is a silent bypass. Unknown-string
      // log-and-allow remains correct ONLY for gates.exit_observe above.
      const reason = `${gateString}: no verifier registered for a BINDING gate (fail-closed)`;
      blocked_by.push(reason);
      await logAnomalyEvent({ supabase, ventureId, stageNumber: fromStage, anomalyKind: 'unresolvable_binding_verifier', gateString, reason });
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
