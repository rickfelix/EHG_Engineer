/**
 * Operator Contract — venture-factory binding (FR-7).
 * (SD-LEO-INFRA-OPERATOR-CONTRACT-GATE-001)
 *
 * Ventures inherit operate-by-default: a venture-stage CREATOR (a stage that
 * produces new persistent output — a new table/writer/flag/detector) is held to
 * the SAME operator-contract as a harness SD, at the venture completion seam.
 *
 * CRITICAL (FR-7 AC): this calls the SHARED core validator (detectCreator +
 * triple validators + evaluateOperatorContract from ./index.js). There is NO
 * duplicated detection/validation logic — the venture seam and the harness gate
 * are ONE validator with two input adapters. If the harness heuristics change,
 * the venture binding changes with them automatically.
 */
import {
  detectCreator,
  validateConsumer,
  validateCadence,
  validateReaper,
  evaluateOperatorContract,
  CREATOR_KINDS,
} from './index.js';

/**
 * Evaluate the operator contract for a venture-stage output.
 *
 * The caller (the venture completion seam) supplies the stage's changed files /
 * migrations (however the factory represents them), the live
 * periodic_process_registry rows, the retention policy list, and any waiver — the
 * SAME inputs the harness adapter assembles, just from venture sources.
 *
 * @param {Object} input
 * @param {Array<{path,added}>} [input.changedFiles]
 * @param {Array<{path,sql}>} [input.migrations]
 * @param {string[]} [input.createdTables]
 * @param {Array<Object>} [input.registryRows]
 * @param {Array<{table:string}>} [input.retentionPolicies]
 * @param {string[]} [input.capabilityKeys]
 * @param {Object|null} [input.waiver]
 * @param {Date} [input.now]
 * @returns {{verdict:'pass'|'fail', reason:string, missing:string[], waiver_audit:Object|null}}
 */
export function evaluateVentureOperatorContract({
  changedFiles = [],
  migrations = [],
  createdTables = [],
  registryRows = [],
  retentionPolicies = [],
  capabilityKeys = [],
  waiver = null,
  now = new Date(),
} = {}) {
  const creator = detectCreator({ changedFiles, migrations });

  // The venture seam declares its created persistent output via metadata
  // (created_tables), not always as raw migration SQL. An explicitly-declared
  // created table IS a TABLE CREATOR even when detectCreator saw no CREATE TABLE.
  if (createdTables.length && !creator.creator_kinds.includes(CREATOR_KINDS.TABLE)) {
    creator.creator_kinds.push(CREATOR_KINDS.TABLE);
    creator.evidence.push(`venture-declared created table(s): ${createdTables.join(', ')}`);
    creator.is_creator = true;
  }

  if (!creator.is_creator) {
    return evaluateOperatorContract({ creator, triple: {}, now });
  }

  const consumer = validateConsumer({ changedFiles, createdTables });
  const keys = capabilityKeys.length ? capabilityKeys : createdTables.flatMap((t) => [t, `${t}-sweep`, t.replace(/_/g, '-')]);
  const cadence = validateCadence({ registryRows, capabilityKeys: keys });
  const reaper = validateReaper({ retentionPolicies, createdTables });

  return evaluateOperatorContract({
    creator,
    triple: {
      consumer_present: consumer.consumer_present,
      cadence_armed: cadence.cadence_armed,
      reaper_present: reaper.reaper_present,
    },
    waiver,
    now,
  });
}
