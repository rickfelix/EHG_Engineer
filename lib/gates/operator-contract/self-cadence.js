/**
 * Operator Contract — self-cadence + regression (FR-8).
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001)
 *
 * The gate must satisfy its OWN contract: it operates on a registered cadence with
 * a witness, not merely as inline merge-time code. This registers the gate in
 * periodic_process_registry (reusing the existing ARMED-registration primitive —
 * no new table, no schema change) and provides the zero-false-positive regression
 * harness over recently-merged non-CREATOR SDs (SC#5).
 */
import { registerArmedMachinery, armedProcessKey } from '../../machinery-class/armed-registration.js';
import { detectCreator } from './index.js';

/** Logical key passed to the ARMED primitive. */
export const OPERATOR_CONTRACT_LOGICAL_KEY = 'operator-contract-gate';

/**
 * The ACTUAL periodic_process_registry.process_key of the gate's self-registration
 * (the ARMED primitive prefixes the logical key). Use THIS to look up the row /
 * its witness (last_fired_at).
 */
export const OPERATOR_CONTRACT_PROCESS_KEY = armedProcessKey(OPERATOR_CONTRACT_LOGICAL_KEY);

/**
 * Register the operator-contract gate itself on a cadence with an activation
 * trigger. ARMED until the gate first fires at a real PLAN-TO-LEAD, at which point
 * the owning path stamps last_fired_at (the witness).
 *
 * @param {Object} supabase - service-role client
 * @param {{expectedIntervalSeconds?: number}} [opts]
 * @returns {Promise<{ok: boolean, processKey?: string, error?: string}>}
 */
export async function registerOperatorContractCadence(supabase, opts = {}) {
  return registerArmedMachinery(
    supabase,
    { sd_key: OPERATOR_CONTRACT_LOGICAL_KEY },
    {
      activationTrigger: 'operator_contract_gate_fired_at_plan_to_lead',
      owner: 'operator-contract-gate',
      expectedIntervalSeconds: opts.expectedIntervalSeconds || 86400,
    },
  );
}

/**
 * Zero-false-positive regression (SC#5): run detectCreator over a set of already
 * merged, known non-CREATOR SD diffs and assert NONE is classified as a CREATOR.
 * Pure — the caller supplies the diffs (from git or fixtures) so this stays
 * testable and DB-free.
 *
 * @param {Array<{sd_key: string, changedFiles?: Array, migrations?: Array}>} sdDiffs
 * @returns {{falsePositives: Array<{sd_key, creator_kinds}>, checked: number, clean: boolean}}
 */
export function regressionFalsePositives(sdDiffs = []) {
  const falsePositives = [];
  for (const d of sdDiffs) {
    const r = detectCreator({ changedFiles: d.changedFiles || [], migrations: d.migrations || [] });
    if (r.is_creator) falsePositives.push({ sd_key: d.sd_key, creator_kinds: r.creator_kinds });
  }
  return { falsePositives, checked: sdDiffs.length, clean: falsePositives.length === 0 };
}
