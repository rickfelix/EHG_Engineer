/**
 * Machinery-class classifier — SD-LEO-INFRA-DEFINITION-DONE-ACTIVATION-001 (G3, FR-2).
 *
 * Decides whether an SD/QF's deliverable is "event-processing machinery" (a worker,
 * watcher, router, gate, cron, or hook) — the class subject to the amended Definition-
 * of-Done (FR-1: must reach ACTIVATED or ARMED, never just "merged + tests green").
 *
 * Deliberately NOT the same predicate as scripts/modules/activation-invariant/
 * trigger-evaluator.js's evaluateTrigger(): that evaluator requires a SCHEMA match
 * AND a consumer match (schema+UI or schema+worker chain) — a pure cron/watcher fix
 * with no schema change (the common case for G3's own named specimens: an
 * eva-scheduler watcher, a capture gauge, a remediation router) would never trigger
 * it. Machinery-class has no schema precondition; a worker/watcher/router/gate/
 * cron/hook is machinery-class on its own, schema or not.
 *
 * Reuses the SAME dual-scan signal-extraction pattern (structured key_changes[].type
 * + negation-aware free-text) and the same hasAffirmativeMatch/collectFreeText
 * helpers as trigger-evaluator.js, imported via its TRIGGER_INTERNALS export, so the
 * two classifiers share one negation/clause-boundary implementation rather than
 * diverging copies.
 *
 * Conservative-DOWN on ambiguity (defaults to 'none'): over-gating here blocks real
 * work, the opposite bias from tier-rank normalization's conservative-UP.
 */
import { TRIGGER_INTERNALS } from '../../scripts/modules/activation-invariant/trigger-evaluator.js';

const { hasAffirmativeMatch, collectStructuredTypes, collectFreeText } = TRIGGER_INTERNALS;

/** Structured key_changes[].type tokens that mark a machinery-class deliverable. */
export const MACHINERY_TYPES = new Set(['worker', 'consumer', 'job', 'cron', 'watcher', 'router', 'gate', 'hook', 'service']);

/**
 * Free-text anchors for machinery-class deliverables. Phrase-bound (not bare single
 * words like "gate"/"hook" alone) to avoid the same 58% FP class trigger-evaluator.js
 * tuned away from (QF-20260513-725) — "gate" and "hook" are common English words in
 * SD prose unrelated to a literal gate/hook file.
 */
const MACHINERY_TEXT_REGEX = /\b(cron job|scheduled job|background worker|watcher process|periodic watcher|remediation router|event router|validation gate|gate file|lifecycle hook|git hook|webhook handler|new (worker|watcher|router|cron)|worker[^.]*(populates|writes|consumes|processes)|watcher[^.]*(polls|monitors|checks))\b/i;

/**
 * Classify an SD/QF row as machinery-class or not.
 * @param {Object} sd - a strategic_directives_v2 or quick_fixes-shaped row (key_changes, description, scope, title)
 * @returns {{ machineryClass: boolean, kind: string, reason: string }}
 */
export function classifyMachineryClass(sd) {
  if (!sd || typeof sd !== 'object') {
    return { machineryClass: false, kind: 'none', reason: 'no_sd_provided' };
  }

  const types = collectStructuredTypes(sd.key_changes);
  const structuredMatch = [...MACHINERY_TYPES].some((t) => types.has(t));

  const text = collectFreeText(sd);
  const textMatch = hasAffirmativeMatch(MACHINERY_TEXT_REGEX, text);

  const machineryClass = structuredMatch || textMatch;
  let reason = 'neither_lane_detected_machinery';
  if (structuredMatch && textMatch) reason = 'both_lanes_match';
  else if (structuredMatch) reason = 'structured_type_match';
  else if (textMatch) reason = 'free_text_match';

  return {
    machineryClass,
    kind: machineryClass ? matchedKind(types, text) : 'none',
    reason,
  };
}

/** Best-effort specific kind for the metadata.machinery_class stamp (informational only). */
function matchedKind(types, text) {
  for (const t of MACHINERY_TYPES) {
    if (types.has(t)) return t;
  }
  const lower = (text || '').toLowerCase();
  if (/watcher/.test(lower)) return 'watcher';
  if (/cron/.test(lower)) return 'cron';
  if (/router/.test(lower)) return 'router';
  if (/hook/.test(lower)) return 'hook';
  if (/gate/.test(lower)) return 'gate';
  return 'worker';
}
