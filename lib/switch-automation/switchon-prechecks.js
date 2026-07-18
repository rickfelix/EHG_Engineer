/**
 * Op-co switch-on 7-mandatory-prechecks orchestrator —
 * SD-LEO-INFRA-INTELLIGENT-SWITCH-AUTOMATION-001-C.
 *
 * This is a SECOND, ADDITIVE gate that runs strictly AFTER child B's
 * authorizeSwitchOn() (lib/switch-automation/switchon-precheck-gate.js) has already
 * returned authorized:true. Per Solomon adjudication ab03cf18, an authorized-reversible
 * verdict is necessary but not sufficient — a real auto-proceed must ALSO clear all 6
 * of the checks below (PC-1 through PC-6; PC-7 is the audit stamp this orchestrator
 * itself writes for every decision, not a gate check). This module does NOT import or
 * re-run the classifier or authorizeSwitchOn — callers are expected to have already
 * obtained authorized:true before invoking this.
 *
 * @module lib/switch-automation/switchon-prechecks
 */
import { checkRevertPathVerified } from './prechecks/revert-path.js';
import { checkObserveClean } from './prechecks/observe-clean.js';
import { checkDependencyBlastRadius } from './prechecks/blast-radius.js';
import { checkGaugeAlarmArmed } from './prechecks/gauge-alarm.js';
import { checkRateSoak } from './prechecks/rate-soak.js';
import { checkFreezeAndIncident } from './prechecks/freeze-incident.js';
import { computePolicyVersion, recordSwitchOnAuditStamp } from './prechecks/audit-stamp.js';

/**
 * Wraps a single check call so a thrown exception never aborts the remaining checks
 * and is itself recorded as a fail-closed failure (never defaults to passed).
 */
async function safeRun(id, name, fn) {
  try {
    return await fn();
  } catch (err) {
    return { id, name, passed: false, reason: `threw:${err.message}` };
  }
}

/**
 * @param {Object} supabase - service-role Supabase client
 * @param {Object} request
 * @param {string} request.component
 * @param {string} request.action
 * @param {string} request.actor - who/what is driving this switch-on decision
 * @param {Object} evidence - per-check evidence bundle
 * @param {Object} evidence.revertPath - see checkRevertPathVerified's evidence param
 * @param {Object} evidence.observeClean - see checkObserveClean's evidence param
 * @param {(dependentComponentKey: string) => boolean|null} evidence.incidentEvidenceFn - PC-3's dependent-incident lookup
 * @param {string} evidence.gaugeProcessKey - PC-4's periodic_process_registry.process_key
 * @param {Object} [evidence.rateSoakOpts] - PC-5 tuning overrides
 * @param {boolean|null} evidence.openIncident - PC-6's own-component incident flag
 * @returns {Promise<{allPassed: boolean, results: Array, blockingIds: string[]}>}
 */
export async function runSwitchOnPrechecks(supabase, request, evidence = {}) {
  const { component, action, actor } = request;

  const results = await Promise.all([
    safeRun('PC-1', 'revert-path-verified', () => checkRevertPathVerified(evidence.revertPath)),
    safeRun('PC-2', 'observe-clean', () => checkObserveClean(evidence.observeClean)),
    safeRun('PC-3', 'dependency-blast-radius', () => checkDependencyBlastRadius(supabase, component, evidence.incidentEvidenceFn)),
    safeRun('PC-4', 'gauge-alarm-armed', () => checkGaugeAlarmArmed(supabase, evidence.gaugeProcessKey)),
    safeRun('PC-5', 'rate-soak', () => checkRateSoak(supabase, component, evidence.rateSoakOpts)),
    safeRun('PC-6', 'freeze-and-incident', () => checkFreezeAndIncident(supabase, component, { openIncident: evidence.openIncident })),
  ]);

  const allPassed = results.every((r) => r.passed);
  const blockingIds = results.filter((r) => !r.passed).map((r) => r.id);
  const decision = allPassed ? 'auto-proceed' : 'held-for-chairman';

  const policyVersion = await computePolicyVersion(supabase);
  await recordSwitchOnAuditStamp(supabase, {
    component,
    action,
    actor,
    policyVersion,
    evidenceSnapshot: { request, results },
    decision,
  });

  return { allPassed, results, blockingIds };
}

export default runSwitchOnPrechecks;
